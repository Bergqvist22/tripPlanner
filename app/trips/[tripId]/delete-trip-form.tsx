"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field } from "@/app/field";
import styles from "@/app/form.module.css";

export function DeleteTripForm({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setDeleting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: fields.get("deletePassword") }),
      });
      if (response.ok) {
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
