import { createHash, randomUUID } from 'node:crypto';
import { MCPClient } from '@mastra/mcp';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import { noopLogger } from '@mastra/core/logger';
import { FEATURES } from '../src/mailbox.mjs';

export function rulesRank({ predict }) {
  return { model: 'rules', scores: predict.map(({ id, row }) => {
    const f = Object.fromEntries(FEATURES.map((name, index) => [name, row[index]]));
    const p = 0.5 + 0.15 * f.free_trial + 0.1 * Number(f.distance <= 1)
      - 0.15 * f.comes_to_you + 0.1 * Number(f.value >= 2) - 0.2 * Number(f.days_left === -1);
    return { id, p: Math.max(0, Math.min(1, p)) };
  }) };
}

async function connectMCP({ env, fetch }) {
  const client = new MCPClient({ id: randomUUID(), servers: { tabpfn: {
    url: new URL('https://api.priorlabs.ai/mcp/server'),
    requestInit: { headers: { Authorization: `Bearer ${env.PRIOR_LABS_MCP_TOKEN}` } },
    fetch, onToolError: 'throw', logger: () => {},
  } } });
  client.__setLogger(noopLogger);
  try {
    const tools = await client.listTools();
    return { callTool: async ({ name, arguments: args }) => {
      const tool = tools[`tabpfn_${name}`];
      if (!tool?.execute) throw new Error('Missing tool');
      return tool.execute(args, { requestContext: new RequestContext(), observe: noopObserve });
    }, close: () => client.disconnect() };
  } catch { await client.disconnect().catch(() => {}); throw new Error('Connection failed'); }
}

function unpack(value) {
  if (value?.isError) throw new Error('MCP failed');
  if (value?.structuredContent) return value.structuredContent;
  if (value?.content) return JSON.parse(value.content.find(item => item.type === 'text')?.text ?? 'null');
  return value;
}
const csv = (header, rows) => [header.join(','), ...rows.map(row => row.join(','))].join('\n') + '\n';

// Parse the server's curl instructions as data; never run shell commands or send
// the MCP bearer token to signed storage URLs.
function uploadRequest(command) {
  if (typeof command !== 'string' || !/--request\s+PUT\b/.test(command) || !command.includes('--upload-file')) throw new Error('Invalid upload command');
  const urls = [...command.matchAll(/'(https:\/\/[^']+)'/g)];
  const url = urls.at(-1)?.[1];
  if (!url) throw new Error('Missing upload URL');
  const headers = {};
  for (const [, header] of command.matchAll(/(?:-H|--header)\s+'([^']+)'/g)) {
    const colon = header.indexOf(':');
    if (colon < 1) throw new Error('Invalid header');
    headers[header.slice(0, colon)] = header.slice(colon + 1).trim();
  }
  return { url, method: 'PUT', headers };
}

function downloadURL(value) {
  if (typeof value === 'string') {
    if (/^https:\/\/\S+$/.test(value)) return value;
    // Some server versions return a ready-to-run curl download command.
    if (/^curl\b/.test(value)) return value.match(/'(https:\/\/[^']+)'/)?.[1];
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/download|prediction|result|url|command/i.test(key)) {
        const found = downloadURL(item);
        if (found) return found;
      }
    }
  }
  return undefined;
}

export function createTabPFN({ env = process.env, fetch = globalThis.fetch, connect = connectMCP,
  now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const fits = new Map();
  async function rank(body) {
    const { train, predict } = body;
    if (!env.PRIOR_LABS_MCP_TOKEN || train.length < 6 || new Set(train.map(row => row.label)).size !== 2 || !predict.length) return rulesRank(body);
    const controller = new AbortController();
    let timer, client;
    const deadline = now() + 60000;
    const guardedFetch = (url, init = {}) => fetch(url, { ...init, signal: init.signal
      ? AbortSignal.any([init.signal, controller.signal]) : controller.signal });
    async function check() { if (controller.signal.aborted || now() >= deadline) throw new Error('Timeout'); }
    async function call(name, args) {
      await check();
      const result = unpack(await client.callTool({ name, arguments: args }));
      await check(); return result;
    }
    async function upload(data, file, content) {
      const entry = data?.uploads?.find(item => item.file === file);
      const { url, ...init } = uploadRequest(entry?.upload_command);
      await check();
      const response = await guardedFetch(url, { ...init, body: content });
      if (!response.ok) throw new Error('Upload failed');
    }
    const key = createHash('sha256').update(JSON.stringify(train)).digest('hex');
    async function work() {
      client = await connect({ env, fetch: guardedFetch, signal: controller.signal });
      if (controller.signal.aborted) { await client.close?.(); throw new Error('Timeout'); }
      let fitted = fits.get(key);
      if (!fitted) {
        const prepared = await call('prepare_train_set_upload', { x_format: 'csv', y_format: 'csv' });
        await upload(prepared, 'x_train.csv', csv(FEATURES, train.map(row => row.row)));
        await upload(prepared, 'y_train.csv', csv(['label'], train.map(row => [row.label])));
        fitted = (await call('fit', { train_set_upload_id: prepared.train_set_upload_id, task: 'classification' }))?.fitted_train_set_id;
        if (!fitted) throw new Error('Missing fit');
        const pollDeadline = now() + 45000;
        for (;;) {
          const remaining = pollDeadline - now();
          if (remaining <= 0) throw new Error('Fit timed out');
          let pollTimer, status;
          try {
            status = await Promise.race([call('get_fit_status', { fitted_train_set_id: fitted }),
              new Promise((_, reject) => { pollTimer = setTimeout(() => reject(new Error('Fit timed out')), remaining); })]);
          } finally { clearTimeout(pollTimer); }
          if (['completed', 'complete', 'succeeded', 'success'].includes(status?.status)) break;
          if (['failed', 'error', 'cancelled'].includes(status?.status) || now() >= pollDeadline) throw new Error('Fit failed or timed out');
          await sleep(Math.min(1000, pollDeadline - now()));
        }
        await check();
        fits.set(key, fitted);
        if (fits.size > 32) fits.delete(fits.keys().next().value);
      }
      const prepared = await call('prepare_test_set_upload', { fitted_train_set_id: fitted, x_format: 'csv' });
      await upload(prepared, 'x_test.csv', csv(FEATURES, predict.map(row => row.row)));
      const prediction = await call('predict', { test_set_upload_id: prepared.test_set_upload_id, fitted_train_set_id: fitted, task: 'classification' });
      const url = downloadURL(prediction);
      if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('Missing prediction URL');
      const response = await guardedFetch(url);
      if (!response.ok) throw new Error('Download failed');
      const data = await response.json();
      await check();
      const rows = Array.isArray(data) ? data : data?.predictions;
      const classes = data?.classes ?? prediction.metadata?.classes ?? prediction.classes ?? prediction.classes_ ?? [0, 1];
      const positive = classes.findIndex(label => Number(label) === 1);
      if (positive < 0 || !Array.isArray(rows) || rows.length !== predict.length) throw new Error('Invalid probabilities');
      const scores = predict.map(({ id }, index) => {
        const row = rows[index];
        const p = Array.isArray(row) ? row[positive] : row?.['1'];
        if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('Invalid probability');
        return { id, p };
      });
      return { model: 'tabpfn', scores };
    }
    try {
      return await Promise.race([work(), new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Timeout')); }, 60000);
      })]);
    } catch { fits.delete(key); return rulesRank(body); }
    finally {
      clearTimeout(timer); controller.abort();
      if (client) void Promise.resolve(client.close?.()).catch(() => {});
    }
  }
  return { rank };
}
