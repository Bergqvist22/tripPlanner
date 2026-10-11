"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field } from "@/app/field";
import styles from "@/app/form.module.css";
import type { FieldErrors } from "@/lib/trips";

export function AddStopForm({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [adding, setAdding] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setAdding(true);
    setErrors({});
    try {
      const response = await fetch(`/api/trips/${tripId}/stops`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: fields.get("stopName") }),
      });
      if (response.status === 400) {
        setErrors((await response.json()).errors);
        return;
      }
      if (!response.ok) {
        // Locked again or gone: the refreshed page shows which.
        setErrors({ request: (await response.json()).error });
        router.refresh();
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setErrors({ request: "The Stop could not be added. Check your connection and try again." });
    } finally {
      setAdding(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Field
        label="New Stop"
        error={errors.name ?? errors.request}
        hint="A name is enough. Dates can follow later."
      >
        <input name="stopName" required maxLength={100} placeholder="Monterey" />
      </Field>
      <button className={styles.submit} type="submit" disabled={adding}>
        {adding ? "Adding…" : "Add Stop"}
      </button>
    </form>
  );
}
