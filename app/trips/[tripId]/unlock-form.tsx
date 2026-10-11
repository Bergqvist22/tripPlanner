"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field } from "@/app/field";
import styles from "@/app/form.module.css";

export function UnlockForm({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [unlocking, setUnlocking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setUnlocking(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/trips/${tripId}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: fields.get("password") }),
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      // Wrong password, too many attempts or a Trip that is gone: the server says which.
      setError((await response.json()).error);
    } catch {
      setError("The Trip could not be unlocked. Check your connection and try again.");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <Field label="Trip password" error={error}>
        <input name="password" type="password" required autoComplete="current-password" autoFocus />
      </Field>
      <button className={styles.submit} type="submit" disabled={unlocking}>
        {unlocking ? "Unlocking…" : "Unlock Trip"}
      </button>
    </form>
  );
}
