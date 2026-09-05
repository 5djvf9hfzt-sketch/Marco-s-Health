/**
 * Minimaler Service Worker für Offline-Fähigkeit + iOS "Zum Home-Bildschirm
 * hinzufügen".
 *
 * Strategie: "Network falling back to cache", NUR für Same-Origin-GET-Requests
 * (App-Shell: HTML/JS/CSS/Icons/Manifest). Wir cachen bewusst NICHTS, was an
 * den CORS-Relay oder an Fitbit geht (das läuft immer live, nie aus dem
 * Cache – alte Health-Daten aus einem Cache zu zeigen wäre irreführend).
 *
 * Ablauf: Bei jedem Request zuerst das Netzwerk versuchen (damit man bei
 * bestehender Verbindung immer die neueste Version bekommt) und die Antwort
 * dabei im Cache ablegen. Schlägt das Netzwerk fehl (offline), wird aus dem
 * Cache bedient. Da Vite den Datei-Hashes bei jedem Build ändert, bauen wir
 * absichtlich KEINE vorab generierte Liste von Dateinamen (Precache) – der
 * Cache füllt sich einfach mit dem, was beim Nutzen der App tatsächlich
 * angefragt wurde ("Run-time Caching").
 *
 * CACHE_NAME bei strukturellen Änderungen an dieser Datei hochzählen, damit
 * alte Service-Worker-Instanzen sauber ersetzt werden.
 */

const CACHE_NAME = "vitalsync-cache-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Fitbit/Relay-Requests niemals abfangen

  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Fallback für Navigations-Requests (App-Start offline): App-Shell aus Cache.
        if (request.mode === "navigate") {
          return caches.match(new URL(self.registration.scope));
        }
        return Response.error();
      })
  );
});
