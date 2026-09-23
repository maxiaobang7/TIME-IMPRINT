const CACHE = "time-imprint-studio-v12";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/", "/manifest.webmanifest"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("time-imprint-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        if (response.ok) event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {}));
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE);
        // These are same-origin static files; module requests can carry Origin
        // while installation fetches do not. Ignore Vary for the offline copy.
        const cached = await cache.match(event.request, {
          ignoreVary: true,
          ignoreSearch: new URL(event.request.url).pathname.startsWith("/icons/"),
        });
        return cached || Response.error();
      })
  );
});
