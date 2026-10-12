"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./recently-deleted.module.css";

// Restores a Stop or an Item from Recently deleted.
export function RestoreButton({ endpoint, name }: { endpoint: string; name: string }) {
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string>();

  async function restore() {
    setRestoring(true);
    setError(undefined);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      // Already restored by a fellow traveller comes to the same thing.
      if (response.ok || response.status === 404) {
        router.refresh();
        return;
      }
      setError((await response.json()).error);
    } catch {
      setError("It could not be restored. Check your connection and try again.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <>
      <button className={styles.restore} type="button" onClick={restore} disabled={restoring} aria-label={`Restore ${name}`}>
        {restoring ? "Restoring…" : "Restore"}
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
