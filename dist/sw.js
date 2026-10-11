// Bump this version when changing the app shell or its startup dependencies.
const VERSION = 'wtw-2026-10-12-1';
const SHELL = [
  '/', '/index.html', '/chirashi.mjs', '/chirashi.css', '/theme.js',
  '/manifest.webmanifest', '/walks.mjs', '/mailbox.mjs', '/rules.mjs',
  '/catalog.mjs', '/rail-lines.mjs', '/researched.mjs', '/station-coordinates.json',
  '/fonts/zen.css', '/fonts/ticket.css',
  '/icons/og-image.png', '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png', '/icons/favicon-48.png'
];
const shellPaths = new Set(SHELL);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL.map(path => new Request(path, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(name => name !== VERSION).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, navigation) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.status === 200) await cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    const cached = await cache.match(navigation ? '/index.html' : request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function fontFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.status === 200) await cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  // Photos, API calls and external destinations always go directly to the network.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/fonts/') && url.pathname.endsWith('.woff2')) {
    event.respondWith(fontFirst(request));
  } else if (request.mode === 'navigate' || shellPaths.has(url.pathname)) {
    event.respondWith(networkFirst(request, request.mode === 'navigate'));
  }
});
