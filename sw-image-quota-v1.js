const CACHE_NAME = "jintian-chidian-image-quota-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./refresh.html",
  "./manifest.webmanifest",
  "./src/app.js?v=20260703-v1",
  "./src/core.js?v=20260703-v1",
  "./src/styles.css?v=20260703-v1",
  "./assets/food-doodles.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => caches.match("./index.html"));
    })
  );
});
