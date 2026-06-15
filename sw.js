/* Asad Iqbal — Personal Website Service Worker
 * Bump CACHE_VERSION whenever you change precached files (CSS/HTML/icons)
 * so returning visitors get the update.
 */
const CACHE_VERSION = "v12.3";
const PRECACHE = `precache-${CACHE_VERSION}`;
const RUNTIME = `runtime-${CACHE_VERSION}`;

// Core "app shell" — cached on install so the site works offline.
// Paths are relative to the service worker's location (repo root).
const APP_SHELL = [
  "./",
  "./index.html",
  "./portfolio.html",
  "./Articles/article-physics.html",
  "./Articles/article-thoughts-modern-relationships.html",
  "./Articles/article-website.html",
  "./Games/battleships.html",
  "./Games/connect4.html",
  "./Games/hangman.html",
  "./Games/noughts-crosses.html",
  "./main-style.css",
  "./style.css",
  "./offline.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
];

// Hosts whose responses should never be cached (live/dynamic data).
const NETWORK_ONLY_HOSTS = [
  "spotify-api-swart-rho.vercel.app", // now-playing widget
  "api.emailjs.com",                  // contact form
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) =>
      // addAll fails the whole install if any URL 404s; add resiliently instead.
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== PRECACHE && key !== RUNTIME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Allow the page to trigger an immediate update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET; let the browser do POSTs (contact form, etc.).
  if (request.method !== "GET") return;

  // Live data — always go to the network, never cache.
  if (NETWORK_ONLY_HOSTS.includes(url.hostname)) return;

  // Page navigations: network-first, fall back to cache, then offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match(request)) ||
            (await caches.match("./index.html"));
          return cached || caches.match("./offline.html");
        })
    );
    return;
  }

  // Everything else (CSS, JS, images, fonts, CDN assets):
  // stale-while-revalidate — fast from cache, refreshed in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(RUNTIME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});