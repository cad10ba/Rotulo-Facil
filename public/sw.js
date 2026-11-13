const CACHE_VERSION = 'v2';
const STATIC_CACHE = `rotulofacil-static-${CACHE_VERSION}`;
const NAV_CACHE = `rotulofacil-nav-${CACHE_VERSION}`;
const VALID_CACHES = new Set([STATIC_CACHE, NAV_CACHE]);

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !VALID_CACHES.has(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_NAV_CACHE') {
    event.waitUntil(caches.delete(NAV_CACHE));
  }
});

function isStaticAssetPath(pathname) {
  return (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // NUNCA cachear rotas /api/* nem requisições autenticadas com header Authorization
  if (url.pathname.startsWith('/api/')) return;
  if (request.headers.has('Authorization')) return;

  // Navegação: network-first com fallback ao /index.html em cache quando offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(NAV_CACHE).then((cache) => {
              cache.put('/index.html', copy);
            });
          }
          return response;
        })
        .catch(async () => {
          const navMatch = await caches.match('/index.html', { cacheName: NAV_CACHE });
          if (navMatch) return navMatch;
          const staticMatch = await caches.match('/index.html', { cacheName: STATIC_CACHE });
          if (staticMatch) return staticMatch;
          return new Response('Você está offline e não há página em cache.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        })
    );
    return;
  }

  // Assets estáticos (/assets/*, /icons/*, /manifest.webmanifest): cache-first
  if (isStaticAssetPath(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, copy);
            });
          }
          return response;
        });
      })
    );
  }
});
