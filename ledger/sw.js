// Keeps Bosco's Ledger opening without signal. The page itself is network-first so updates arrive;
// the screenshot reader (its scripts and reading models) is cache-first because those files never change.
const CACHE = "bosco-ledger-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/favicon-64.png"];
const LONG_LIVED = url => url.pathname.includes("/tessdata/") || url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.gstatic.com";

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const keep = r => { if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; };
  if (LONG_LIVED(url)) {
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(keep)));
    return;
  }
  if (url.origin !== location.origin && url.hostname !== "fonts.googleapis.com") return;
  e.respondWith(fetch(e.request).then(keep).catch(() => caches.match(e.request).then(m => m || caches.match("./index.html"))));
});
