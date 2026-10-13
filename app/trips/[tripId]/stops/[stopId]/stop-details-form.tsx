"use client";

import { SaveStatus, useAutosave } from "@/app/autosave";
import { Field } from "@/app/field";
import styles from "@/app/form.module.css";
import type { Stop } from "@/lib/stops";
import { PlaceField, placeEntered, placeShown } from "../../place-field";

function stopShown({ name, arrivalDate, arrivalTime, departureDate, departureTime, notes, place }: Stop) {
  return {
    name,
    arrivalDate: arrivalDate ?? "",
    arrivalTime: arrivalTime ?? "",
    departureDate: departureDate ?? "",
    departureTime: departureTime ?? "",
    notes,
    place: placeShown(place),
  };
}

function stopEntered(typed: ReturnType<typeof stopShown>) {
  return {
    ...typed,
    // An emptied date or time means it is not decided yet.
    arrivalDate: typed.arrivalDate || null,
    arrivalTime: typed.arrivalTime || null,
    departureDate: typed.departureDate || null,
    departureTime: typed.departureTime || null,
    place: placeEntered(typed.place),
  };
}

// Edits a Stop. Each change is saved as it is made.
export function StopDetailsForm({ tripId, stop }: { tripId: string; stop: Stop }) {
  const { typed, errors, held, change, save, form, status } = useAutosave({
    url: `/api/trips/${tripId}/stops/${stop.id}`,
    name: "stop",
    stored: stop,
    shown: stopShown,
    entered: stopEntered,
  });

  return (
    <form className={styles.form} {...form}>
      <Field label="Stop name" error={errors.name}>
        <input {...held("name")} required maxLength={100} />
      </Field>
      <div className={styles.row}>
        <Field label="Arrival" error={errors.arrivalDate}>
          <input {...held("arrivalDate")} type="date" />
        </Field>
        <Field label="Arrival time" error={errors.arrivalTime}>
          <input {...held("arrivalTime")} type="time" />
        </Field>
      </div>
      <div className={styles.row}>
        <Field label="Departure" error={errors.departureDate}>
          <input {...held("departureDate")} type="date" />
        </Field>
        <Field label="Departure time" error={errors.departureTime} hint="The times can be left out.">
          <input {...held("departureTime")} type="time" />
        </Field>
      </div>
      <PlaceField
        tripId={tripId}
        of="Stop"
        place={placeEntered(typed.place)}
        error={errors.place}
        onChange={(place) => {
          change("place", placeShown(place));
          save();
        }}
      />
      <Field label="Notes" error={errors.notes}>
        <textarea {...held("notes")} rows={6} maxLength={10000} />
      </Field>
      <SaveStatus {...status} />
    </form>
  );
}
