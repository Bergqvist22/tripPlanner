import type { OfflineCopy } from "@/lib/offline-copy";

// What a device keeps to read a Trip where there is no connection: the Trip's
// offline copy, and the offline reader that shows it. Only for the browser.

// The offline copy of a Trip and when it was loaded, which is how old it is.
export type KeptCopy = { loadedAt: string; copy: OfflineCopy };

function keyOf(tripId: string) {
  return `trip-offline-copy:${tripId.toLowerCase()}`;
}

// Keeping a copy can fail, as when the device is out of room. The copy kept
// before stays, and says how old it is.
export function keepCopy(tripId: string, copy: OfflineCopy) {
  const kept: KeptCopy = { loadedAt: new Date().toISOString(), copy };
  try {
    localStorage.setItem(keyOf(tripId), JSON.stringify(kept));
  } catch {
    // Nothing more can be kept.
  }
}

// For a Trip that is locked again or gone.
export function dropCopy(tripId: string) {
  try {
    localStorage.removeItem(keyOf(tripId));
  } catch {
    // A device that keeps nothing has nothing to let go.
  }
}

// The copy as it is kept, as text: the same text for as long as it is the
// same copy. Null when the device has none of the Trip.
export function keptCopyText(tripId: string) {
  try {
    return localStorage.getItem(keyOf(tripId));
  } catch {
    return null;
  }
}

// The same as in public/sw.js, which answers from this cache.
const READER_CACHE = "offline-reader";
export const READER_PATH = "/offline";

// The page of the offline reader that stands in for a page of a Trip.
export function readerFor(tripPage: string) {
  return `${READER_PATH}#${tripPage}`;
}

// Whether the device has what it takes to read the Trip without a connection:
// the Trip's offline copy, the offline reader, and the service worker that
// answers with it.
export async function canReadOffline(tripId: string) {
  if (keptCopyText(tripId) === null || !navigator.serviceWorker?.controller) return false;
  const cache = await caches.open(READER_CACHE);
  return (await cache.match(READER_PATH)) !== undefined;
}

// Whether the server can be reached, which a browser that says it has a
// connection does not know. Asked past the service worker and every cache.
export async function serverAnswers() {
  try {
    const response = await fetch("/sw.js", { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

// Keeps the offline reader as it is now: its page and what the page is built
// from. What an earlier version of it was built from is let go.
export async function keepReader() {
  const response = await fetch(READER_PATH, { cache: "no-cache" });
  if (!response.ok) return;
  const page = await response.clone().text();
  const parts = new Set(Array.from(page.matchAll(/\/_next\/static\/[^"'\\\s<>)]+/g), ([part]) => part));
  const cache = await caches.open(READER_CACHE);
  await Promise.all(
    Array.from(parts, async (part) => {
      if (!(await cache.match(part))) await cache.add(part);
    }),
  );
  await cache.put(READER_PATH, response);
  for (const request of await cache.keys()) {
    const { pathname, search } = new URL(request.url);
    if (pathname !== READER_PATH && !parts.has(pathname + search)) await cache.delete(request);
  }
}
