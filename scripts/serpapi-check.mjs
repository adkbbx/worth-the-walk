import { writeFile } from 'node:fs/promises';
import { createSerpApi, mapPlace, sanitizeResponse } from '../agent/serpapi.mjs';
import { loadEnv } from '../agent/env.mjs';

loadEnv();
const args = process.argv.slice(2);
const searchIndex = args.indexOf('--search');
if (searchIndex >= 0 && !args.includes('--yes')) {
  console.error('Refusing search: add --yes to authorize one budgeted search (cache may avoid spending).');
  process.exitCode = 1;
} else {
  const api = createSerpApi({ env: { ...process.env, ...(searchIndex >= 0 ? { SERPAPI_LIVE: '1' } : {}) } });
  if (searchIndex < 0) {
    console.log(JSON.stringify(await api.status(), null, 2));
    if ((await api.status()).enabled) console.log(JSON.stringify(await api.reconcile()));
  } else {
    const name = args[searchIndex + 1];
    const near = args[args.indexOf('--near') + 1];
    const [lat, lon] = (near ?? '').split(',').map(Number);
    if (!name || !args.includes('--near') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      console.error('Usage: --search "business name" --near lat,lon --yes'); process.exitCode = 1;
    } else {
      const { result, reason } = await api.search({ name, lat, lon });
      console.log(JSON.stringify({ reason, place: mapPlace(result, []) }, null, 2));
      if (result) await writeFile(new URL('../tests/fixtures/serpapi-recorded.json', import.meta.url),
        JSON.stringify(sanitizeResponse(result, process.env.SERPAPI_API_KEY), null, 2) + '\n');
    }
  }
}
