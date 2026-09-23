// No caching on purpose: this project changes often, and a cached copy of the
// page or its JS is exactly what once made this page's own glow look broken
// until the cache was cleared, even though the real code was fine.
//
// Chrome still wants a registered service worker with a fetch handler before
// it will offer to install the site as an app, so this exists to satisfy
// that, and nothing else: every request just goes straight to the network,
// as if there were no service worker at all.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Anyone who already has the earlier, caching version of this file gets its
  // stored responses cleared out here, so a stale copy of the page can't keep
  // being served after this update reaches them.
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
