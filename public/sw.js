// Service worker: lets the app install, and never leaves a blank screen.
// On the free hosting plan the server falls asleep after a few quiet minutes and takes up to a minute to wake.
// If a page takes more than a few seconds (or can't load), we show the "Waking up" page, which reloads by itself
// as soon as the server answers. It never caches API calls or logged-in pages, so students always see fresh data.
const CACHE = "vreedits-v2";
const OFFLINE_URL = "/offline.html";
const WAIT_MS = 4500;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith((async () => {
    const network = fetch(req).catch(() => "fail");
    const slow = new Promise((resolve) => setTimeout(() => resolve("slow"), WAIT_MS));
    const first = await Promise.race([network, slow]);
    if (first !== "slow" && first !== "fail") return first;
    const page = await caches.match(OFFLINE_URL);
    if (page) return page;
    // No waiting page saved yet: keep waiting for the real answer instead of showing nothing.
    const late = await network;
    return late === "fail" ? Response.error() : late;
  })());
});
