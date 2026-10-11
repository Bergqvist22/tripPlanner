"use client";

import { SaveStatus, useAutosave } from "@/app/autosave";
import { Field } from "@/app/field";
import styles from "@/app/form.module.css";
import type { Place } from "@/lib/place-search";
import type { Stop } from "@/lib/stops";
import { PlaceField } from "../../place-field";

// A place as a field holds it: as text, the same for the same place.
function placeShown(place: Place | null) {
  if (!place) return "";
  const { label, latitude, longitude } = place;
  return JSON.stringify({ label, latitude, longitude });
}

function placeEntered(shown: string): Place | null {
  return shown ? JSON.parse(shown) : null;
}

function stopShown({ name, arrivalDate, departureDate, notes, place }: Stop) {
  return { name, arrivalDate: arrivalDate ?? "", departureDate: departureDate ?? "", notes, place: placeShown(place) };
}

function stopEntered(typed: ReturnType<typeof stopShown>) {
  return {
    ...typed,
    // An emptied date means it is not decided yet.
    arrivalDate: typed.arrivalDate || null,
    departureDate: typed.departureDate || null,
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
        <Field label="Departure" error={errors.departureDate}>
          <input {...held("departureDate")} type="date" />
        </Field>
      </div>
      <PlaceField
        tripId={tripId}
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
