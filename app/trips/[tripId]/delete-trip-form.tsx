"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field } from "@/app/field";
import styles from "@/app/form.module.css";
import { dropCopy } from "@/app/offline/kept";
import type { Trip } from "@/lib/trips";

// Deletes a Trip for good. One with a Trip password takes it again to confirm;
// one without asks first.
export function DeleteTripForm({ trip }: { trip: Pick<Trip, "id" | "name" | "hasPassword"> }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);

  async function deleteTrip(password?: FormDataEntryValue | null) {
    setDeleting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/trips/${trip.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        dropCopy(trip.id);
        router.replace("/");
        router.refresh();
        return;
      }
      setError((await response.json()).error);
    } catch {
      setError("The Trip could not be deleted. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    deleteTrip(new FormData(event.currentTarget).get("deletePassword"));
  }

  if (trip.hasPassword) {
    return (
      <form className={styles.form} onSubmit={submit}>
        <Field label="Trip password" error={error}>
          <input name="deletePassword" type="password" required autoComplete="off" />
        </Field>
        <button className={`${styles.submit} ${styles.danger}`} type="submit" disabled={deleting}>
          {deleting ? "Deleting…" : "Delete Trip permanently"}
        </button>
      </form>
    );
  }

  if (!confirming) {
    return (
      <div className={styles.form}>
        <button className={`${styles.submit} ${styles.danger}`} type="button" onClick={() => setConfirming(true)}>
          Delete Trip
        </button>
      </div>
    );
  }

  return (
    <div className={styles.form} role="group" aria-label="Confirm deleting the Trip">
      <p className={styles.question}>Delete {trip.name} and everything in it?</p>
      <p className={styles.hint}>A deleted Trip cannot be restored.</p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button
        className={`${styles.submit} ${styles.danger}`}
        type="button"
        onClick={() => deleteTrip()}
        disabled={deleting}
      >
        {deleting ? "Deleting…" : "Yes, delete Trip permanently"}
      </button>
      <button className={styles.cancel} type="button" onClick={() => setConfirming(false)} disabled={deleting}>
        Cancel
      </button>
    </div>
  );
}
