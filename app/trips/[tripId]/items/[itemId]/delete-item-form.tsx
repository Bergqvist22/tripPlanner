"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/app/form.module.css";
import type { Item } from "@/lib/items";
import { listedOn } from "../listed-on";

export function DeleteItemForm({ tripId, item }: { tripId: string; item: Item }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();

  async function deleteItem() {
    setDeleting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/trips/${tripId}/items/${item.id}`, { method: "DELETE" });
      // Already deleted by a fellow traveller comes to the same thing.
      if (response.ok || response.status === 404) {
        router.replace(listedOn(tripId, item.stopId));
        router.refresh();
        return;
      }
      setError((await response.json()).error);
    } catch {
      setError("The Item could not be deleted. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <div className={styles.form}>
        <p className={styles.hint}>Takes the Item off the Trip.</p>
        <button className={`${styles.submit} ${styles.danger}`} type="button" onClick={() => setConfirming(true)}>
          Delete Item
        </button>
      </div>
    );
  }

  return (
    <div className={styles.form} role="group" aria-label="Confirm deleting the Item">
      <p className={styles.question}>Delete {item.title}?</p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button className={`${styles.submit} ${styles.danger}`} type="button" onClick={deleteItem} disabled={deleting}>
        {deleting ? "Deleting…" : "Yes, delete Item"}
      </button>
      <button className={styles.cancel} type="button" onClick={() => setConfirming(false)} disabled={deleting}>
        Cancel
      </button>
    </div>
  );
}
