/* REBUILD service worker — network-first so updates are never stuck behind a stale cache. */
const CACHE_NAME = "rebuild-standalone-v3";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./js/data.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Cache each file independently so one missing URL can't void the whole
      // precache (unlike cache.addAll, which is atomic/all-or-nothing).
      Promise.allSettled(CORE.map((url) => cache.add(url)))
    ).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    // `cache: "no-store"` forces a real network trip instead of letting the
    // browser's HTTP cache hand back a stale file — so a reload always gets the
    // latest deploy when online, and falls back to the cache only when offline.
    fetch(request, { cache: "no-store" })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
