// Lull service worker: makes the app open instantly and work offline.
// Bump VERSION when you change files to force a clean refresh.
const VERSION = 'lull-v3-read-token-scanner';
const FONT_CACHE = 'lull-fonts';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/rest.js',
  './js/shortcuts.js',
  './js/token-scanner.js',
  './js/vendor/jsQR.js',
  './js/ui.js',
  './js/charts.js',
  './js/sounds.js',
  './js/sky.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
];
const scope = new URL(self.registration.scope);
const shell = new URL('index.html', scope);
const staticPaths = new Set(ASSETS.map(path => new URL(path, scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      // Other apps on the same github.io address keep their own caches, so only old Lull caches are removed.
      .then(keys => Promise.all(keys.filter(k => k.startsWith('lull-') && k !== VERSION && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('Authorization')) return;
  const url = new URL(req.url);

  // Google Fonts: cache forever once fetched.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  if (url.origin !== scope.origin || !staticPaths.has(url.pathname)) return;
  const isShell = url.pathname === scope.pathname || url.pathname === shell.pathname;
  if (req.mode === 'navigate' && !isShell) return;

  // App files: answer from cache straight away, refresh the cache in the background.
  // Changes you push to GitHub show up on the next launch.
  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const key = isShell ? shell.href : req;
      const cached = await cache.match(key, { ignoreSearch: true });
      const network = fetch(req).then(res => {
        if (res.ok) cache.put(key, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
