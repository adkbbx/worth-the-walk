import { readFileSync } from 'node:fs';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { noopLogger } from '@mastra/core/logger';
import { RequestContext } from '@mastra/core/request-context';
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { Observability } from '@mastra/observability';
import { SentryExporter } from '@mastra/sentry';
import { z } from 'zod';
import { parseJsonLoose, normalizeTile, mergeFallback, finalizeFlyer, matchChain, storable } from '../src/mailbox.mjs';
import { visionModel, textModel, modelInfo } from './models.mjs';
import { TILE_PROMPT, MERGE_PROMPT } from './prompts.mjs';
import { createTools, rulesRank } from './tools.mjs';
import { readPageSchema, mergeSchema, locateSchema, rankSchema } from './schemas.mjs';
import { modelCall } from './queue.mjs';

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== null && !(Array.isArray(item) && !item.length))
    .map(([key, item]) => [key, compact(item)]));
}

// Demo mode places each walkable flyer 300–900 m from the home station so walks can be planned offline.
function mockLocation(flyerId, home) {
  let hash = 0;
  for (const char of String(flyerId)) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  const meters = 300 + hash % 600, angle = (hash % 360) * Math.PI / 180;
  return { lat: home.lat + meters * Math.cos(angle) / 111320,
    lon: home.lon + meters * Math.sin(angle) / (111320 * Math.cos(home.lat * Math.PI / 180)),
    source: 'mock', precision: 'demo' };
}

function usable(tile) {
  return tile.business.name || tile.category !== 'other' || tile.address ||
    tile.offers.length || tile.items.length || tile.phones.length || tile.websites.length;
}

// normalizeTile deliberately drops page metadata, so attach only validated page numbers afterward.
function normalizeMerged(raw, pages) {
  const tile = normalizeTile(raw);
  if (!usable(tile)) return null;
  const pageOf = entry => Number.isInteger(entry?.page) && entry.page >= 0 && entry.page < pages.length ? entry.page : null;
  tile.offers = tile.offers.map((offer, index) => ({ ...offer, page: pageOf(raw.offers[index]) }));
  const itemPages = (Array.isArray(raw.items) ? raw.items : [])
    .filter(item => normalizeTile({ items: [item] }).items.length).map(pageOf);
  tile.items = tile.items.map((item, index) => ({ ...item, page: itemPages[index] }));
  if ([...tile.offers, ...tile.items].some(entry => entry.page == null)) return null;
  if (tile.summary_en) tile.summary_en = tile.summary_en.slice(0, 120);
  return tile;
}

export function createApp({ fetch, env = process.env } = {}) {
  const mock = env.MOCK_GEMMA === '1';
  const allowLocate = !mock || fetch !== undefined;
  const fixtures = mock ? JSON.parse(readFileSync(new URL('../tests/fixtures/tiles.json', import.meta.url), 'utf8')) : null;
  const { gsiGeocode, serpapiPlace, rankFlyers } = createTools({ fetch, env });
  const flyerReader = new Agent({ id: 'flyer-reader', name: 'flyer-reader', instructions: TILE_PROMPT, model: visionModel(env) });
  const flyerMerger = new Agent({ id: 'flyer-merger', name: 'flyer-merger', instructions: MERGE_PROMPT, model: textModel(env) });

  async function locate(input) {
    const { q, name, phones, lat, lon } = locateSchema.parse(input);
    if (!allowLocate) return null;
    const address = q ? await gsiGeocode({ q }) : null;
    return address ?? await serpapiPlace({ name, phones, lat, lon });
  }

  const readStep = createStep({
    id: 'read-tiles', inputSchema: readPageSchema, outputSchema: z.unknown(),
    execute: async ({ inputData, requestContext, tracingContext }) => {
      const { pageId, tiles } = inputData;
      const onEvent = requestContext.get('onEvent') ?? (() => {});
      const results = Array(tiles.length).fill(null);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, tiles.length) }, async () => {
        while (next < tiles.length) {
          const index = next++;
          let tile = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              if (mock) tile = normalizeTile(fixtures[index % fixtures.length]);
              else {
                const [header, base64] = tiles[index].split(',');
                const output = await modelCall(() => flyerReader.generate([{
                  role: 'user', content: [
                    { type: 'text', text: TILE_PROMPT },
                    { type: 'image', image: new Uint8Array(Buffer.from(base64, 'base64')), mediaType: header.slice(5).split(';')[0] },
                  ],
                }], { tracingContext, requestContext }));
                if (output.error) throw new Error('Tile read failed');
                const raw = parseJsonLoose(output.text);
                if (!raw || Array.isArray(raw)) throw new Error('Invalid tile JSON');
                tile = normalizeTile(raw);
              }
              break;
            } catch { /* Retry once; never expose provider errors or model text. */ }
          }
          results[index] = tile;
          await onEvent(tile ? { type: 'tile', index, tile } : { type: 'tile-error', index, message: 'Unable to read tile after two attempts' });
        }
      }));
      const done = { type: 'done', pageId, tiles: results };
      await onEvent(done);
      return done;
    },
  });
  const readWorkflow = createWorkflow({ id: 'readPage', inputSchema: readPageSchema, outputSchema: z.unknown() }).then(readStep).commit();

  const mergeStep = createStep({
    id: 'merge-and-locate', inputSchema: mergeSchema, outputSchema: z.unknown(),
    execute: async ({ inputData, tracingContext, requestContext }) => {
      const { flyerId, pages, scanDate, home } = inputData;
      let merged;
      if (!mock) {
        try {
          const readings = pages.flatMap((page, index) => page.tiles.filter(Boolean).map(tile => ({ ...normalizeTile(tile), page: index })));
          const output = await modelCall(() => flyerMerger.generate([{
            role: 'user', content: JSON.stringify(compact(readings)),
          }], { tracingContext, requestContext }));
          if (!output.error) merged = normalizeMerged(parseJsonLoose(output.text), pages);
        } catch { /* Invalid or failed model merges use the existing deterministic rules. */ }
      }
      const flyer = finalizeFlyer({ ...(merged ?? mergeFallback(pages)), id: flyerId, pageIds: pages.map(page => page.id) }, scanDate, matchChain);
      if (flyer.bucket === 'keep') return storable(flyer);
      // Only places worth walking to need coordinates; this also keeps paid lookups for real stops.
      if (flyer.bucket !== 'walk') return { ...flyer, location: null };
      if (mock && fetch === undefined) return { ...flyer, location: home ? mockLocation(flyerId, home) : null };
      const location = await locate({ q: flyer.address ?? undefined, name: flyer.business.name ?? undefined,
        phones: flyer.phones, lat: home?.lat, lon: home?.lon });
      return { ...flyer, location };
    },
  });
  const mergeWorkflow = createWorkflow({ id: 'mergeFlyer', inputSchema: mergeSchema, outputSchema: z.unknown() }).then(mergeStep).commit();

  const observability = env.SENTRY_DSN ? new Observability({ configs: { default: {
    serviceName: 'chirashi-walk',
    exporters: [new SentryExporter({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV || 'development', tracesSampleRate: 1, logger: noopLogger,
      options: { defaultIntegrations: false, sendDefaultPii: false } })],
    // Export trace structure/timing only. No images, readings, credentials, or provider errors.
    spanOutputProcessors: [{ name: 'omit-flyer-payloads', process(span) {
      if (!span) return span;
      span.input = undefined; span.output = undefined; span.attributes = {}; span.metadata = {};
      span.errorInfo = undefined; span.requestContext = undefined;
      return span;
    }, async shutdown() {} }],
  } } }) : undefined;
  const mastra = new Mastra({ agents: { flyerReader, flyerMerger }, workflows: { readPage: readWorkflow, mergeFlyer: mergeWorkflow },
    logger: noopLogger, ...(observability ? { observability } : {}) });

  async function run(name, inputData, onEvent) {
    const requestContext = new RequestContext();
    if (onEvent) requestContext.set('onEvent', onEvent);
    const outcome = await (await mastra.getWorkflow(name).createRun()).start({ inputData, requestContext,
      tracingOptions: { hideInput: true, hideOutput: true } });
    if (outcome.status !== 'success') throw new Error('Workflow failed');
    return outcome.result;
  }
  return {
    mastra,
    readPage: (input, onEvent) => run('readPage', readPageSchema.parse(input), onEvent),
    mergeFlyer: input => run('mergeFlyer', mergeSchema.parse(input)),
    locate,
    rank: body => {
      const input = rankSchema.parse(body);
      return mock && fetch === undefined ? Promise.resolve(rulesRank(input)) : rankFlyers(input);
    },
    config: () => ({ mode: mock ? 'mock' : env.LOCAL_LLM === '1' ? 'local' : 'cloud', model: modelInfo(env).model,
      features: { serpapi: Boolean(env.SERPAPI_API_KEY), tabpfn: Boolean(env.PRIOR_LABS_MCP_TOKEN), sentry: Boolean(env.SENTRY_DSN) } }),
  };
}
