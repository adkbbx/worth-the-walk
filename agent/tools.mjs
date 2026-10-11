import { randomUUID } from 'node:crypto';
import { createTool, noopObserve } from '@mastra/core/tools';
import { RequestContext } from '@mastra/core/request-context';
import { MCPClient } from '@mastra/mcp';
import { noopLogger } from '@mastra/core/logger';
import { z } from 'zod';
import { FEATURES, phoneKey } from '../src/mailbox.mjs';
import { rankSchema, latitude, longitude } from './schemas.mjs';
import { modelCall } from './queue.mjs';

export function rulesRank({ predict }) {
  return { model: 'rules', scores: predict.map(({ id, row }) => {
    const f = Object.fromEntries(FEATURES.map((name, index) => [name, row[index]]));
    const p = 0.5 + 0.15 * f.free_trial + 0.1 * Number(f.distance <= 1)
      - 0.15 * f.comes_to_you + 0.1 * Number(f.value >= 2) - 0.2 * Number(f.days_left === -1);
    return { id, p: Math.max(0, Math.min(1, p)) };
  }) };
}

let loggedRankTool = false;

export function createTools({ fetch = globalThis.fetch, env = process.env } = {}) {
  const cache = new Map();
  async function json(url, timeout) {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new Error('Lookup failed');
    return response.json();
  }

  async function gsiGeocode({ q }) {
    if (!q?.trim()) return null;
    const key = q.trim();
    if (cache.has(key)) {
      const value = cache.get(key);
      cache.delete(key); cache.set(key, value);
      return structuredClone(value);
    }
    try {
      const url = new URL('https://msearch.gsi.go.jp/address-search/AddressSearch');
      url.searchParams.set('q', key);
      const first = (await json(url, 8000))?.[0];
      const [lon, lat] = first?.geometry?.coordinates ?? [];
      const value = latitude.safeParse(lat).success && longitude.safeParse(lon).success
        ? { lat, lon, source: 'gsi', precision: 'block', title: first.properties?.title ?? null } : null;
      cache.set(key, value);
      if (cache.size > 500) cache.delete(cache.keys().next().value);
      return structuredClone(value);
    } catch { return null; }
  }

  async function serpapiPlace({ name, lat, lon, phones = [] }) {
    if (!env.SERPAPI_API_KEY || !name || !latitude.safeParse(lat).success || !longitude.safeParse(lon).success) return null;
    try {
      const url = new URL('https://serpapi.com/search.json');
      for (const [key, value] of Object.entries({ engine: 'google_maps', type: 'search', q: name,
        ll: `@${lat},${lon},14z`, hl: 'ja', api_key: env.SERPAPI_API_KEY })) url.searchParams.set(key, value);
      const result = await json(url, 10000);
      const place = result.place_results ?? result.local_results?.[0];
      const gps = place?.gps_coordinates;
      if (!latitude.safeParse(gps?.latitude).success || !longitude.safeParse(gps?.longitude).success) return null;
      const key = phoneKey(place.phone);
      return { lat: gps.latitude, lon: gps.longitude, source: 'serpapi', precision: 'place', place: {
        title: place.title ?? null, address: place.address ?? null, rating: place.rating ?? null,
        reviews: place.reviews ?? null, phone: place.phone ?? null, hours: place.hours ?? place.operating_hours ?? null,
        phoneMatches: key !== null && phones.some(phone => phoneKey(phone) === key),
      } };
    } catch { return null; }
  }

  async function rankFlyers(body) {
    const { train, predict } = body;
    if (!env.PRIOR_LABS_MCP_TOKEN || train.length < 6 || new Set(train.map(value => value.label)).size !== 2 || !predict.length) return rulesRank(body);
    let mcp;
    try {
      return await modelCall(async () => {
        mcp = new MCPClient({ id: randomUUID(), servers: { remote: {
          url: new URL('https://api.priorlabs.ai/mcp/server'),
          requestInit: { headers: { Authorization: `Bearer ${env.PRIOR_LABS_MCP_TOKEN}` } },
          fetch, onToolError: 'throw', logger: () => {},
        } } });
        mcp.__setLogger(noopLogger);
        const tools = await mcp.listTools();
        // Prior Labs' inline fit/predict tool accepts matrices in FEATURES order.
        const entry = Object.entries(tools).find(([name]) => /fit_and_predict_inline$/.test(name))
          ?? Object.entries(tools).find(([name]) => /classif.*predict|predict.*classif/.test(name));
        if (!entry?.[1]?.execute) throw new Error('Classification tool unavailable');
        if (!loggedRankTool) { console.log(entry[0]); loggedRankTool = true; }
        const result = await entry[1].execute({
          X_train: train.map(value => value.row), y_train: train.map(value => value.label),
          X_test: predict.map(value => value.row), task_type: 'classification', output_type: 'probas',
        }, { requestContext: new RequestContext(), observe: noopObserve });
        let data = result?.structuredContent ?? result;
        if (data?.content) {
          const block = data.content.find(value => value.type === 'text');
          data = JSON.parse(block?.text ?? 'null');
        }
        const probabilities = data?.predictions;
        const classes = data?.classes ?? data?.classes_ ?? [0, 1];
        const positive = classes.findIndex(value => Number(value) === 1);
        if (positive < 0 || !Array.isArray(probabilities) || probabilities.length !== predict.length) throw new Error('Invalid probabilities');
        const scores = predict.map(({ id }, index) => {
          const p = probabilities[index]?.[positive];
          if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('Invalid probability');
          return { id, p };
        });
        return { model: 'tabpfn', scores };
      });
    } catch { return rulesRank(body); }
    finally { if (mcp) await mcp.disconnect().catch(() => {}); }
  }

  const tools = {
    gsiGeocode: createTool({ id: 'gsi-geocode', description: 'Locate a printed Japanese address with GSI.',
      inputSchema: z.object({ q: z.string().max(1000) }), outputSchema: z.unknown(), execute: gsiGeocode }),
    serpapiPlace: createTool({ id: 'serpapi-place', description: 'Find a business near home and compare its printed phone.',
      inputSchema: z.object({ name: z.string().max(300), lat: latitude, lon: longitude, phones: z.array(z.string()).default([]) }),
      outputSchema: z.unknown(), execute: serpapiPlace }),
    rankFlyers: createTool({ id: 'rank-flyers', description: `Classify feature rows in order: ${FEATURES.join(', ')}; target: label.`,
      inputSchema: rankSchema, outputSchema: z.unknown(), execute: rankFlyers }),
  };
  return { tools, gsiGeocode, serpapiPlace, rankFlyers };
}
