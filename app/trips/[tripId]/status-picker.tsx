"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import type { Item } from "@/lib/items";
import { STATUSES, STATUS_NAMES, type Status } from "@/lib/statuses";
import styles from "./status-picker.module.css";

// Changes an Item's Status with one tap. Each Item has its own: choosing one
// does nothing to the Items beside it.
export function StatusPicker({ tripId, item }: { tripId: string; item: Pick<Item, "id" | "title" | "status"> }) {
  const router = useRouter();
  // The new Status is shown at once and holds until the server has confirmed it.
  const [status, showStatus] = useOptimistic(item.status);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const lastSave = useRef<Promise<unknown>>(Promise.resolve());

  function change(to: Status) {
    if (to === status) return;
    setError(undefined);
    startTransition(async () => {
      showStatus(to);
      try {
        // One save at a time, so quick taps reach the server in the order made.
        const save = lastSave.current.then(() =>
          fetch(`/api/trips/${tripId}/items/${item.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: to }),
          }),
        );
        lastSave.current = save.catch(() => undefined);
        const response = await save;
        if (!response.ok) {
          const refused = await response.json();
          setError(refused.error ?? refused.errors?.status ?? "The Status could not be saved.");
        }
      } catch {
        setError("The Status could not be saved. Check your connection and try again.");
      }
      // Shows the Status as the server has it, saved or not.
      router.refresh();
    });
  }

  return (
    <>
      <div className={styles.picker} role="group" aria-label={`Status of ${item.title}`}>
        {STATUSES.map((choice) => (
          <button
            key={choice}
            type="button"
            className={styles.choice}
            data-status={choice}
            aria-pressed={choice === status}
            onClick={() => change(choice)}
          >
            {STATUS_NAMES[choice]}
          </button>
        ))}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
