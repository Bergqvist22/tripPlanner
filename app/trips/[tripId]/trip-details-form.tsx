"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field } from "@/app/field";
import styles from "@/app/form.module.css";
import type { FieldErrors, Trip } from "@/lib/trips";

export function TripDetailsForm({ trip, currencies }: { trip: Trip; currencies: readonly string[] }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const entered = {
      name: String(fields.get("name")),
      creatorName: String(fields.get("creatorName")),
      travellerCount: Number(fields.get("travellerCount")),
      displayCurrency: String(fields.get("displayCurrency")),
    };
    // Only what changed is sent, so a fellow traveller's change to another
    // detail is not undone.
    const changes = Object.fromEntries(
      Object.entries(entered).filter(([detail, value]) => value !== trip[detail as keyof typeof entered]),
    );
    setSaving(true);
    setSaved(false);
    setErrors({});
    try {
      const response = await fetch(`/api/trips/${trip.id}`, {
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
      <Field label="Trip name" error={errors.name}>
        <input name="name" required maxLength={100} defaultValue={trip.name} />
      </Field>
      <Field label="Creator name" error={errors.creatorName}>
        <input name="creatorName" required maxLength={100} defaultValue={trip.creatorName} />
      </Field>
      <div className={styles.row}>
        <Field label="Travellers" error={errors.travellerCount}>
          <input
            name="travellerCount"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            defaultValue={trip.travellerCount}
            required
          />
        </Field>
        <Field label="Display currency" error={errors.displayCurrency}>
          <select name="displayCurrency" defaultValue={trip.displayCurrency} required>
            {currencies.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </select>
        </Field>
      </div>
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
