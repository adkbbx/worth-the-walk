import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { phoneKey } from '../src/mailbox.mjs';

const flights = new Map();
const fields = ['title', 'address', 'gps_coordinates', 'rating', 'reviews', 'phone', 'hours', 'operating_hours', 'type'];
const validGPS = (lat, lon) => Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180;

export function mapPlace(response, phones = []) {
  const place = response?.place_results ?? response?.local_results?.[0];
  const gps = place?.gps_coordinates;
  if (!validGPS(gps?.latitude, gps?.longitude)) return null;
  const key = phoneKey(place.phone);
  return { lat: gps.latitude, lon: gps.longitude, source: 'serpapi', precision: 'place', place: {
    title: place.title ?? null, address: place.address ?? null, rating: place.rating ?? null,
    reviews: place.reviews ?? null, phone: place.phone ?? null, hours: place.hours ?? place.operating_hours ?? null,
    phoneMatches: key !== null && phones.some(phone => phoneKey(phone) === key),
  } };
}

export function sanitizeResponse(response, secret = '') {
  function clean(value) {
    if (typeof value === 'string') {
      if (/api_key/i.test(value)) return null;
      return secret ? value.split(secret).join('[redacted]') : value;
    }
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/api_key/i.test(key)).map(([key, item]) => [key, clean(item)]));
    return value;
  }
  const place = value => value && typeof value === 'object'
    ? Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, clean(value[key])])) : null;
  return { ...(response?.place_results ? { place_results: place(response.place_results) } : {}),
    ...(Array.isArray(response?.local_results) ? { local_results: response.local_results.slice(0, 3).map(place) } : {}) };
}

export function createSerpApi({ env = process.env, fetch = globalThis.fetch, dir = '.cache/serpapi', now = () => new Date() } = {}) {
  dir = resolve(dir);
  const enabled = Boolean(env.SERPAPI_API_KEY), live = env.SERPAPI_LIVE === '1';
  const limit = (value, fallback) => value === undefined ? fallback
    : /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
  const dailyLimit = limit(env.SERPAPI_DAILY_LIMIT, 5), monthlyLimit = limit(env.SERPAPI_MONTHLY_LIMIT, 40);
  const usagePath = join(dir, 'usage.json');
  function dates() {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now());
    return { day, month: day.slice(0, 7) };
  }
  async function ledger() {
    const { day, month } = dates();
    let value;
    try { value = JSON.parse(await readFile(usagePath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (value && (!Number.isInteger(value.dayCount) || value.dayCount < 0 || !Number.isInteger(value.monthCount) || value.monthCount < 0)) throw new Error('Invalid ledger');
    return { month, monthCount: value?.month === month ? value.monthCount : 0,
      day, dayCount: value?.month === month && value?.day === day ? value.dayCount : 0,
      accountLeft: Number.isFinite(value?.accountLeft) ? value.accountLeft : null, accountCheckedAt: value?.accountCheckedAt ?? null };
  }
  async function save(path, value) {
    await mkdir(dir, { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(value), { mode: 0o600, flush: true });
    await rename(temp, path);
  }
  // An exclusive file lock also serializes separate server/check processes. A stale
  // lock fails closed; never risk spending by guessing that its owner has died.
  async function locked(fn) {
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'usage.lock');
    let lock;
    for (let attempt = 0; attempt < 200; attempt++) {
      try { lock = await open(path, 'wx'); break; }
      catch (error) { if (error.code !== 'EEXIST') throw error; await new Promise(r => setTimeout(r, 10)); }
    }
    if (!lock) throw new Error('Budget ledger busy');
    try { return await fn(); } finally { await lock.close(); await unlink(path); }
  }
  async function searchOnce({ name, lat, lon }, key) {
    const path = join(dir, `${key}.json`);
    try {
      const cached = JSON.parse(await readFile(path, 'utf8'));
      const age = now().getTime() - Date.parse(cached.savedAt);
      if (age >= 0 && age < 30 * 86400000) return { result: sanitizeResponse(cached.response, env.SERPAPI_API_KEY), reason: 'cache' };
    } catch { /* Missing or invalid caches are misses. */ }
    if (!live) return { result: null, reason: 'not-live' };
    if (!enabled) return { result: null, reason: 'disabled' };
    try {
      const allowed = await locked(async () => {
        const value = await ledger();
        if (value.dayCount >= dailyLimit || value.monthCount >= monthlyLimit || (value.accountLeft !== null && value.accountLeft <= 20)) return false;
        value.dayCount++; value.monthCount++;
        if (value.accountLeft !== null) value.accountLeft--;
        await save(usagePath, value);
        return true;
      });
      if (!allowed) return { result: null, reason: 'budget' };
      const url = new URL('https://serpapi.com/search.json');
      for (const [k, v] of Object.entries({ engine: 'google_maps', type: 'search', hl: 'ja', q: name,
        ll: `@${lat},${lon},14z`, api_key: env.SERPAPI_API_KEY })) url.searchParams.set(k, v);
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      if (data.error) throw new Error('Search failed');
      const result = sanitizeResponse(data, env.SERPAPI_API_KEY);
      await save(path, { savedAt: now().toISOString(), response: result });
      return { result, reason: 'live' };
    } catch { return { result: null, reason: 'error' }; }
  }
  function search(input) {
    if (!input?.name?.trim() || !validGPS(input.lat, input.lon)) return Promise.resolve({ result: null, reason: 'invalid' });
    const key = createHash('sha256').update(`google_maps|${input.name.normalize('NFKC').trim().toLowerCase()}|${input.lat.toFixed(3)}|${input.lon.toFixed(3)}|ja`).digest('hex');
    const flightKey = `${dir}/${key}/${enabled}/${live}`;
    if (!flights.has(flightKey)) {
      const promise = searchOnce(input, key).finally(() => flights.delete(flightKey));
      flights.set(flightKey, promise);
    }
    return flights.get(flightKey).then(value => structuredClone(value));
  }
  async function status() {
    const { dayCount, monthCount, accountLeft } = await ledger();
    return { enabled, live, dayCount, dailyLimit, monthCount, monthlyLimit, accountLeft };
  }
  async function reconcile() {
    if (!enabled) return null;
    try {
      return await locked(async () => {
        const url = new URL('https://serpapi.com/account.json');
        url.searchParams.set('api_key', env.SERPAPI_API_KEY);
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) return null;
        const data = await response.json();
        const left = data.plan_searches_left ?? data.total_searches_left;
        if (data.error || !Number.isFinite(left) || left < 0) return null;
        const value = await ledger();
        value.accountLeft = left; value.accountCheckedAt = now().toISOString();
        await save(usagePath, value);
        return { accountLeft: left };
      });
    } catch { return null; }
  }
  return { search, status, reconcile };
}
