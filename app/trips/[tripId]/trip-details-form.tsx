"use client";

import { SaveStatus, useAutosave } from "@/app/autosave";
import { Field } from "@/app/field";
import styles from "@/app/form.module.css";
import type { Trip } from "@/lib/trips";

function tripShown({ name, creatorName, travellerCount, displayCurrency }: Trip) {
  return { name, creatorName, travellerCount: String(travellerCount), displayCurrency };
}

function tripEntered(typed: ReturnType<typeof tripShown>) {
  return { ...typed, travellerCount: Number(typed.travellerCount) };
}

// Edits the details of a Trip. Each change is saved as it is made.
export function TripDetailsForm({ trip, currencies }: { trip: Trip; currencies: readonly string[] }) {
  const { errors, held, form, status } = useAutosave({
    url: `/api/trips/${trip.id}`,
    name: "trip",
    stored: trip,
    shown: tripShown,
    entered: tripEntered,
  });

  return (
    <form className={styles.form} {...form}>
      <Field label="Trip name" error={errors.name}>
        <input {...held("name")} required maxLength={100} />
      </Field>
      <Field label="Creator name" error={errors.creatorName}>
        <input {...held("creatorName")} required maxLength={100} />
      </Field>
      <div className={styles.row}>
        <Field label="Travellers" error={errors.travellerCount}>
          <input {...held("travellerCount")} type="number" inputMode="numeric" min={1} step={1} required />
        </Field>
        <Field label="Display currency" error={errors.displayCurrency}>
          <select {...held("displayCurrency")} required>
            {currencies.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </select>
        </Field>
      </div>
      <SaveStatus {...status} />
    </form>
  );
}
