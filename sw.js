/* PREVIUNT – Service Worker (alcance: la carpeta donde está, p. ej. /previunt/ en GitHub Pages)
   - App (mismo origen): red primero con tiempo límite de 3 s; si la red no responde, la copia guardada.
     Así los cambios del equipo se ven al recargar, y con señal lenta la app abre igual.
   - Leaflet (unpkg) y la librería de Firebase (gstatic, versión fija): caché primero. Son código público,
     no datos ni credenciales.
   - NO se cachean: datos de Firebase (base de datos), inicio de sesión y tokens (identitytoolkit,
     securetoken), Open-Meteo, rutas ni teselas del mapa. Esas peticiones van siempre directo a la red.
   - Elevación (AWS Terrain Tiles): caché primero. El relieve no cambia; así la ruta a zona alta funciona sin red.
   Sube VERSION cuando cambies la lista de archivos. */
const VERSION = "previunt-v19";
const APP = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];
// Los 6 tiles de elevación (z12) que cubren Trujillo, El Porvenir, Florencia de Mora y Víctor Larco
const ELEV = [1148, 1149].flatMap((x) => [2139, 2140, 2141].map((y) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/${x}/${y}.png`));
const LIBS = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];
// Librería de Firebase usada por app.js (misma versión). Sin ella la app no puede reconectar al abrirse sin red.
const FB_SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
const FIREBASE = ["firebase-app.js", "firebase-auth.js", "firebase-database.js"].map((f) => FB_SDK + f);
const ESPERA_RED_MS = 3000;
let redLentaDesde = 0; // tras una espera agotada, 1 min sirviendo la copia primero (así no se espera 3 s por archivo)

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(APP);
    await Promise.allSettled(LIBS.concat(FIREBASE, ELEV).map((u) => c.add(new Request(u, { mode: "cors" }))));
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
      const copia = await caches.match(req, { ignoreSearch: true });
      const red = fetch(req).then(async (r) => {
        if (r.ok) (await caches.open(VERSION)).put(req, r.clone());
        return r;
      });
      red.catch(() => {}); // si gana la copia, un fallo posterior de la red no queda como error suelto
      // Red lenta o caída hace poco: copia guardada primero (la red sigue y actualiza la caché)
      if (copia && Date.now() - redLentaDesde < 60000) return copia;
      if (!copia) {
        try { return await red; }
        catch { return (req.mode === "navigate" && (await caches.match("./index.html"))) || Response.error(); }
      }
      try {
        return await Promise.race([red, new Promise((_, no) => setTimeout(() => no(new Error("lenta")), ESPERA_RED_MS))]);
      } catch {
        redLentaDesde = Date.now();
        return copia;
      }
    })());
    return;
  }

  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/10.14.1/")) {
    e.respondWith((async () => {
      const hit = await caches.match(req.url);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) (await caches.open(VERSION)).put(req.url, r.clone());
      return r;
    })());
    return;
  }
  if (url.hostname === "unpkg.com") {
    e.respondWith((async () => (await caches.match(req)) || fetch(req))());
    return;
  }
  if (url.hostname === "s3.amazonaws.com" && url.pathname.startsWith("/elevation-tiles-prod/")) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req.url);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req.url, r.clone());
      return r;
    })());
  }
  // Todo lo demás (Open-Meteo, base de datos e inicio de sesión de Firebase, OSM) va directo a la red.
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const lista = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (lista.length) return lista[0].focus();
    return self.clients.openWindow("./index.html");
  })());
});
