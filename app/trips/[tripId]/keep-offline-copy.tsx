"use client";

import { useEffect, useSyncExternalStore } from "react";
import { canReadOffline, dropCopy, keepCopy, keepReader, readerFor } from "@/app/offline/kept";
import styles from "./keep-offline-copy.module.css";

// How long a page has to stay as it is before the Trip is copied, so a run of
// changes is copied once.
const PAUSE_MS = 500;

// How long the connection has to stay lost before the page gives way to the
// offline reader.
const PATIENCE_MS = 3000;

// The offline reader is kept once for as long as the tab stays open.
let readerKept = false;

// Keeps the Trip readable where there is no connection. Every time a page of
// the Trip has been loaded, which `loadedAt` tells, the Trip's offline copy is
// kept on the device. When the connection is lost the page says so, and gives
// way to the offline reader, where nothing can be edited.
export function KeepOfflineCopy({ tripId, loadedAt }: { tripId: string; loadedAt: string }) {
  useEffect(() => {
    const pause = setTimeout(async () => {
      try {
        const response = await fetch(`/api/trips/${tripId}/offline-copy`);
        if (response.ok) keepCopy(tripId, (await response.json()).copy);
        // Locked again or gone: there is no longer anything to read here.
        else if (response.status === 401 || response.status === 404) dropCopy(tripId);
      } catch {
        // No connection: the copy kept before is the last one loaded.
      }
    }, PAUSE_MS);
    return () => clearTimeout(pause);
  }, [tripId, loadedAt]);

  useEffect(() => {
    // Not every browser has a service worker, or lets a page keep anything.
    if (!("serviceWorker" in navigator) || !("caches" in window)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (readerKept) return;
    readerKept = true;
    keepReader().catch(() => {
      readerKept = false;
    });
  }, []);

  const offline = useSyncExternalStore(
    (changed) => {
      window.addEventListener("offline", changed);
      window.addEventListener("online", changed);
      return () => {
        window.removeEventListener("offline", changed);
        window.removeEventListener("online", changed);
      };
    },
    () => !navigator.onLine,
    () => false,
  );

  // A connection that is back within moments is not worth leaving the page
  // for. One that stays lost is, where the device can show the offline copy.
  useEffect(() => {
    if (!offline) return;
    const patience = setTimeout(async () => {
      if (!navigator.onLine && (await canReadOffline(tripId).catch(() => false))) {
        window.location.replace(readerFor(window.location.pathname));
      }
    }, PATIENCE_MS);
    return () => clearTimeout(patience);
  }, [offline, tripId]);

  if (!offline) return null;
  return (
    <p className={styles.offline} role="status">
      You are offline. Nothing you change can be saved until the connection returns.
    </p>
  );
}
