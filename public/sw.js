// The service worker: what lets a Trip be read where there is no connection.
// It keeps nothing itself. A page of a Trip keeps the offline reader in this
// cache, and the Trip's offline copy on the device (app/offline/kept.ts).
const READER_CACHE = "offline-reader";
const READER_PATH = "/offline";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // A page of a Trip that cannot be reached is read in the offline reader,
    // which is told the page that was asked for.
    if (url.pathname.startsWith("/trips/")) {
      event.respondWith(reached(request).catch(() => Response.redirect(`${READER_PATH}#${url.pathname}`)));
    } else if (url.pathname === READER_PATH) {
      event.respondWith(fetch(request).catch(() => kept(READER_PATH)));
    }
    return;
  }

  // What the offline reader is built from. With a connection it comes from
  // the browser's own cache or the server, as it would without this worker.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(fetch(request).catch(() => kept(request)));
  }
});

// How long a page of a Trip may take to begin arriving. Coverage too weak to
// carry it counts as none.
const PATIENCE_MS = 10_000;

function reached(request) {
  const patience = AbortSignal.timeout(PATIENCE_MS);
  return fetch(request, { signal: patience });
}

async function kept(request) {
  const cache = await caches.open(READER_CACHE);
  return (await cache.match(request)) ?? Response.error();
}
