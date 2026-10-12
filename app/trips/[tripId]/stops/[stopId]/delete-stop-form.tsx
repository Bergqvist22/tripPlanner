"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/app/form.module.css";
import type { Stop } from "@/lib/stops";

export function DeleteStopForm({ tripId, stop, itemCount }: { tripId: string; stop: Stop; itemCount: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();

  async function deleteStop() {
    setDeleting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/trips/${tripId}/stops/${stop.id}`, { method: "DELETE" });
      // Already deleted by a fellow traveller comes to the same thing.
      if (response.ok || response.status === 404) {
        router.replace(`/trips/${tripId}`);
        router.refresh();
        return;
      }
      setError((await response.json()).error);
    } catch {
      setError("The Stop could not be deleted. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  const itemsDeleted =
    itemCount === 0
      ? "It has no Items."
      : `${itemCount === 1 ? "Its 1 Item is" : `Its ${itemCount} Items are`} deleted with it.`;

  if (!confirming) {
    return (
      <div className={styles.form}>
        <p className={styles.hint}>Takes the Stop off the Route.</p>
        <button className={`${styles.submit} ${styles.danger}`} type="button" onClick={() => setConfirming(true)}>
          Delete Stop
        </button>
      </div>
    );
  }

  return (
    <div className={styles.form} role="group" aria-label="Confirm deleting the Stop">
      <p className={styles.question}>Delete {stop.name} from the Route?</p>
      <p className={styles.hint}>{itemsDeleted} You can restore it from Recently deleted for 30 days.</p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button className={`${styles.submit} ${styles.danger}`} type="button" onClick={deleteStop} disabled={deleting}>
        {deleting ? "Deleting…" : "Yes, delete Stop"}
      </button>
      <button className={styles.cancel} type="button" onClick={() => setConfirming(false)} disabled={deleting}>
        Cancel
      </button>
    </div>
  );
}
