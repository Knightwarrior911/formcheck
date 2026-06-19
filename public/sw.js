/**
 * Service Worker — FormCheck PWA.
 * Caches app shell for offline use. MediaPipe WASM/model fetched from CDN (not cached).
 */

const CACHE_NAME = "formcheck-v3";
const SHELL_FILES = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/pose.js",
  "/exercises.js",
  "/audio.js",
  "/filters.js",
  "/tracker.js",
  "/calibration.js",
  "/programs.js",
  "/custom-programs.js",
  "/tutorial.js",
  "/messages.js",
  "/sounds.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only cache same-origin requests (app shell)
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // Cache successful GET requests
        if (response.ok && event.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Fallback for offline
      if (event.request.destination === "document") {
        return caches.match("/index.html");
      }
    })
  );
});
