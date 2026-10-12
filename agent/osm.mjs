import { distanceMeters } from '../src/walks.mjs';

const TTL = 7 * 86400000;
const clock = { now: () => Date.now(), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)) };
const queues = new WeakMap();
const lookups = new WeakMap();
const normalizeName = name => name.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const digits = phone => typeof phone === 'string' ? phone.normalize('NFKC').replace(/\D/g, '') : '';
const validGPS = (lat, lon) => Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180;

// All clients share one queue in production. Tests can share an injected clock
// to verify spacing without waiting or making any network requests.
function enqueue(time, task) {
  if (!queues.has(time)) queues.set(time, { tail: Promise.resolve(), next: 0 });
  const queue = queues.get(time);
  const pending = queue.tail.then(async () => {
    while (time.now() < queue.next) await time.sleep(queue.next - time.now());
    queue.next = time.now() + 1100;
    return task();
  });
  queue.tail = pending.catch(() => {});
  return pending;
}

export function createOsm({ fetch = globalThis.fetch, env = process.env, clock: time = clock } = {}) {
  const enabled = env.OSM_LOOKUP !== '0';
  // Cache and flights belong to the transport, so injected fetches stay isolated.
  if (!lookups.has(fetch)) lookups.set(fetch, { cache: new Map(), flights: new Map() });
  const { cache, flights } = lookups.get(fetch);

  async function request(url) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Lookup timed out')); }, 8000);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const response = await fetch(url, { method: 'GET',
          headers: { 'User-Agent': 'WorthTheWalk/0.1 (+https://github.com/adkbbx/worth-the-walk)' }, signal: controller.signal });
        if (response.status !== 200) throw new Error('Lookup failed');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Invalid lookup response');
        return data.filter(place => typeof place?.name === 'string' &&
          [place.lat, place.lon].every(value => (typeof value === 'number' || typeof value === 'string') && String(value).trim()) &&
          validGPS(Number(place.lat), Number(place.lon)));
      })()]);
    } finally { clearTimeout(timer); }
  }

  async function search({ name, lat, lon, phones = [] } = {}) {
    if (!enabled || typeof name !== 'string' || !normalizeName(name) || !validGPS(lat, lon)) return null;
    // The phone sends two-decimal starts. Keep that same precision in the query.
    lat = Number(lat.toFixed(2)); lon = Number(lon.toFixed(2));
    const url = new URL('https://nominatim.openstreetmap.org/search');
    for (const [key, value] of Object.entries({ format: 'jsonv2', q: name.trim(), countrycodes: 'jp',
      viewbox: [lon - 0.03, lat + 0.03, lon + 0.03, lat - 0.03].map(n => n.toFixed(2)).join(','),
      bounded: '1', limit: '5', 'accept-language': 'ja', extratags: '1' })) url.searchParams.set(key, value);
    const key = url.href;
    try {
      let data;
      const saved = cache.get(key);
      if (saved && time.now() - saved.at >= 0 && time.now() - saved.at < TTL) {
        cache.delete(key); cache.set(key, saved);
        data = saved.data;
      } else {
        cache.delete(key);
        if (!flights.has(key)) {
          const pending = enqueue(time, async () => {
            const data = await request(url);
            cache.set(key, { at: time.now(), data });
            if (cache.size > 500) cache.delete(cache.keys().next().value);
            return data;
          }).finally(() => flights.delete(key));
          flights.set(key, pending);
        }
        data = await flights.get(key);
      }
      const query = normalizeName(name);
      const matches = data.filter(place => {
        const title = normalizeName(place.name);
        return title && (title.includes(query) || query.includes(title));
      });
      const place = matches.sort((a, b) => distanceMeters({ lat, lon }, { lat: Number(a.lat), lon: Number(a.lon) }) -
        distanceMeters({ lat, lon }, { lat: Number(b.lat), lon: Number(b.lon) }))[0];
      if (!place) return null;
      const keys = phones.map(digits).filter(Boolean);
      const phoneMatch = ['phone', 'contact:phone'].some(key => {
        const phone = digits(place.extratags?.[key]);
        return phone && keys.includes(phone);
      });
      return { lat: Number(place.lat), lon: Number(place.lon), source: 'osm', precision: 'poi', title: place.name, phoneMatch };
    } catch { return null; }
  }
  return { enabled, search };
}
