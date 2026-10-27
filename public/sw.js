// Service worker: only here so the phone will install Vreedits as an app.
// It does NOT touch page loads or API calls (the browser loads everything straight from the server),
// so it can never show a blank or stale page, for example when coming back from the payment page.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Remove anything saved by older versions of this file, then take over open pages.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Required for installability; it deliberately does nothing, so every request goes to the network as normal.
self.addEventListener("fetch", () => {});
