/**
 * sw.js – Service Worker: App Shell caching strategy
 *
 * Cache-first for static assets (CSS, JS, fonts).
 * Network-first for API routes (always fresh data, fallback to cache).
 */
const SHELL_CACHE = "nr-shell-v5";
const API_CACHE   = "nr-api-v5";

const SHELL_ASSETS = [
  "/",
  "/static/css/app.css",
  "/static/js/app.js",
  "/static/js/components.js",
  "/static/js/pages/overview.js",
  "/static/js/pages/grades.js",
  "/static/js/pages/wallet.js",
  "/static/js/pages/stats.js",
  "/static/js/pages/settings.js",
  "/static/js/pages/tasks.js",
  "/static/manifest.json",
];

// Install: pre-cache shell assets
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== SHELL_CACHE && k !== API_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // API: network-first, cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(API_CACHE).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Shell assets: cache-first
  event.respondWith(
    caches.match(request).then(cached => cached ?? fetch(request))
  );
});
