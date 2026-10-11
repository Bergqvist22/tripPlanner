"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Field } from "@/app/field";
import styles from "@/app/form.module.css";
import type { Stop } from "@/lib/stops";
import type { FieldErrors } from "@/lib/trips";

export function StopDetailsForm({ tripId, stop }: { tripId: string; stop: Stop }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // What the form's fields were last known to hold on the server. Not the
  // refreshed Stop: the fields keep what was typed, so comparing against a
  // fellow traveller's newer value would send theirs back as a change.
  const loaded = useRef(stop);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const entered = {
      name: String(fields.get("name")),
      // An emptied date means it is not decided yet.
      arrivalDate: String(fields.get("arrivalDate")) || null,
      departureDate: String(fields.get("departureDate")) || null,
      notes: String(fields.get("notes")),
    };
    // Only what changed is sent, so a fellow traveller's change to another
    // detail is not undone.
    const changes = Object.fromEntries(
      Object.entries(entered).filter(([detail, value]) => value !== loaded.current[detail as keyof typeof entered]),
    );
    setSaving(true);
    setSaved(false);
    setErrors({});
    try {
      const response = await fetch(`/api/trips/${tripId}/stops/${stop.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(changes),
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
      loaded.current = { ...loaded.current, ...changes };
      setSaved(true);
      router.refresh();
    } catch {
      setErrors({ request: "The changes could not be saved. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} onChange={() => setSaved(false)} noValidate>
      <Field label="Stop name" name="name" error={errors.name}>
        <input id="name" name="name" required maxLength={100} defaultValue={stop.name} />
      </Field>
      <div className={styles.row}>
        <Field label="Arrival" name="arrivalDate" error={errors.arrivalDate}>
          <input id="arrivalDate" name="arrivalDate" type="date" defaultValue={stop.arrivalDate ?? ""} />
        </Field>
        <Field label="Departure" name="departureDate" error={errors.departureDate}>
          <input id="departureDate" name="departureDate" type="date" defaultValue={stop.departureDate ?? ""} />
        </Field>
      </div>
      <Field label="Notes" name="notes" error={errors.notes}>
        <textarea id="notes" name="notes" rows={6} maxLength={10000} defaultValue={stop.notes} />
      </Field>
      {errors.request && (
        <p className={styles.error} role="alert">
          {errors.request}
        </p>
      )}
      <button className={styles.submit} type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </button>
      {saved && (
        <p className={styles.saved} role="status">
          Saved.
        </p>
      )}
    </form>
  );
}
