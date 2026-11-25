/* PREVIUNT – Service Worker
   - App (mismo origen): red primero, caché si no hay conexión → los cambios del equipo se ven al recargar.
   - Leaflet (unpkg): caché primero.
   - Open-Meteo, Firebase y teselas del mapa: NO se cachean (siempre datos reales o "Sin datos disponibles").
   Sube VERSION cuando cambies la lista de archivos. */
const VERSION = "previunt-v7";
const APP = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
const LIBS = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(APP);
    await Promise.allSettled(LIBS.map((u) => c.add(new Request(u, { mode: "cors" }))));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(VERSION)).put(req, r.clone());
        return r;
      } catch {
        return (await caches.match(req, { ignoreSearch: true })) || (await caches.match("./index.html"));
      }
    })());
    return;
  }

  if (url.hostname === "unpkg.com") {
    e.respondWith((async () => (await caches.match(req)) || fetch(req))());
  }
  // Todo lo demás (Open-Meteo, Firebase, OSM) va directo a la red.
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const lista = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (lista.length) return lista[0].focus();
    return self.clients.openWindow("./index.html");
  })());
});
