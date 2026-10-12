import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { FEATURES } from '../src/mailbox.mjs';
import { rankSchema, latitude, longitude } from './schemas.mjs';
import { modelCall } from './queue.mjs';

import { createSerpApi, mapPlace } from './serpapi.mjs';
import { createOsm } from './osm.mjs';
import { createTabPFN } from './tabpfn.mjs';
export { rulesRank } from './tabpfn.mjs';

export function createTools({ fetch = globalThis.fetch, env = process.env, serpapi = createSerpApi({ fetch, env }), osm = createOsm({ fetch, env }), tabpfn = createTabPFN({ fetch, env }) } = {}) {
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
    if (!name || !latitude.safeParse(lat).success || !longitude.safeParse(lon).success) return null;
    const { result } = await serpapi.search({ name, lat, lon });
    return mapPlace(result, phones);
  }

  const osmPlace = input => osm.search(input);

  const rankFlyers = body => modelCall(() => tabpfn.rank(body));

  const tools = {
    gsiGeocode: createTool({ id: 'gsi-geocode', description: 'Locate a printed Japanese address with GSI.',
      inputSchema: z.object({ q: z.string().max(1000) }), outputSchema: z.unknown(), execute: gsiGeocode }),
    serpapiPlace: createTool({ id: 'serpapi-place', description: 'Find a business near home and compare its printed phone.',
      inputSchema: z.object({ name: z.string().max(300), lat: latitude, lon: longitude, phones: z.array(z.string()).default([]) }),
      outputSchema: z.unknown(), execute: serpapiPlace }),
    osmPlace: createTool({ id: 'osm-place', description: 'Find a matching Japanese business near home with OpenStreetMap.',
      inputSchema: z.object({ name: z.string().max(300), lat: latitude, lon: longitude, phones: z.array(z.string()).default([]) }),
      outputSchema: z.unknown(), execute: osmPlace }),
    rankFlyers: createTool({ id: 'rank-flyers', description: `Classify feature rows in order: ${FEATURES.join(', ')}; target: label.`,
      inputSchema: rankSchema, outputSchema: z.unknown(), execute: rankFlyers }),
  };
  return { tools, gsiGeocode, serpapiPlace, osmPlace, rankFlyers, serpapi, osm };
}
