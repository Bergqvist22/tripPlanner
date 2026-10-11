"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Field } from "@/app/field";
import styles from "@/app/form.module.css";
import type { Place } from "@/lib/place-search";
import type { FieldErrors } from "@/lib/trips";
import { PlaceField } from "./place-field";

export function AddStopForm({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [adding, setAdding] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const name = useRef<HTMLInputElement>(null);

  // A Stop that has no name yet is named after the place found for it.
  function choosePlace(chosen: Place | null) {
    setPlace(chosen);
    if (chosen && name.current && name.current.value.trim() === "") {
      name.current.value = chosen.label.split(",")[0].slice(0, 100);
    }
  }

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
        body: JSON.stringify({ name: fields.get("stopName"), place }),
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
      setPlace(null);
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
        <input ref={name} name="stopName" required maxLength={100} placeholder="Monterey" />
      </Field>
      <PlaceField tripId={tripId} place={place} error={errors.place} onChange={choosePlace} />
      <button className={styles.submit} type="submit" disabled={adding}>
        {adding ? "Adding…" : "Add Stop"}
      </button>
    </form>
  );
}
