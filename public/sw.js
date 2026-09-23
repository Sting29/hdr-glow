// Minimal offline cache: everything the tool needs is static and already in
// your browser once you've loaded the page once, so this just remembers what
// was fetched and serves that back when there's no network. No build-time
// list of files to keep in sync, hand-written on purpose like the rest of
// this project's tooling.

const CACHE = "hdr-glow-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      // Serve a cached page instantly if there is one, but still refresh it
      // in the background so the cache doesn't go stale forever.
      return cached || network;
    }),
  );
});
