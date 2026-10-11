"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FocusEvent } from "react";
import type { Calculation, Leg } from "@/lib/legs";
import { TRAVEL_MODE_NAMES, TRAVEL_MODES } from "@/lib/travel-modes";
import type { FieldErrors } from "@/lib/trips";
import { distance, travelTime } from "./travel";
import styles from "./leg-between.module.css";

// Why a Drive has no calculated travel time, and what to do about it.
const UNCALCULATED: Record<Exclude<Calculation, "calculated">, string> = {
  "without-places": "Give both Stops a place to have the drive calculated, or enter the travel time yourself.",
  unavailable: "The drive could not be calculated right now. It is tried again later, or enter the travel time yourself.",
  "no-road": "No road was found between these Stops. Enter the travel time yourself, or choose another travel mode.",
};

// The Leg between two Stops in the Stop list: how the stretch is travelled and
// how long it takes. Opened, its travel mode and travel time can be changed,
// and each change is saved as it is made.
export function LegBetween({
  tripId,
  leg,
  fromName,
  toName,
}: {
  tripId: string;
  leg: Leg;
  fromName: string;
  toName: string;
}) {
  const router = useRouter();
  const id = useId();
  const hours = useRef<HTMLInputElement>(null);
  const minutes = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  // The travel mode just chosen, shown until the refreshed page has it too.
  const [chosen, setChosen] = useState<{ mode: Leg["travelMode"]; over: Leg["travelMode"] }>();
  // Counts the times the travel time typed was put back to the one that counts.
  const [putBack, setPutBack] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});

  const { travelMode, durationMinutes, manualDurationMinutes, calculatedDurationMinutes, distanceMeters } = leg;
  // The page has moved on from the travel mode the choice was made over.
  if (chosen && chosen.over !== travelMode) setChosen(undefined);

  // A Drive whose travel time was entered by hand is marked, to tell it from
  // a calculated one. Any other travel mode has no other kind.
  const setByHand = travelMode === "drive" && manualDurationMinutes !== null;

  async function save(changes: Partial<Pick<Leg, "travelMode" | "manualDurationMinutes">>) {
    setSaving(true);
    setErrors({});
    try {
      const response = await fetch(`/api/trips/${tripId}/legs/${leg.fromStopId}/${leg.toStopId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (response.status === 400) setErrors((await response.json()).errors);
      // Locked again, or the Route has changed: the refreshed page shows which.
      else if (!response.ok) setErrors({ request: (await response.json()).error });
      if (!response.ok) setChosen(undefined);
      router.refresh();
    } catch {
      setChosen(undefined);
      setErrors({ request: "The Leg could not be saved. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  // Saved when the travel time is left, not while moving from hours to minutes.
  function saveTravelTime(event: FocusEvent<HTMLFieldSetElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    // What is not a number reads as nothing typed, and is not taken for emptied.
    if (hours.current!.validity.badInput || minutes.current!.validity.badInput) {
      setErrors({ manualDurationMinutes: "Enter the travel time in hours and minutes" });
      return;
    }
    const [typedHours, typedMinutes] = [hours.current!.value.trim(), minutes.current!.value.trim()];
    // Emptied, it goes back to the calculated travel time, or to none.
    const entered = typedHours === "" && typedMinutes === "" ? null : Number(typedHours) * 60 + Number(typedMinutes);
    if (entered === null && manualDurationMinutes === null) {
      // There was nothing to take away, so the fields show what counts again.
      setPutBack((times) => times + 1);
      return;
    }
    if (entered === durationMinutes) return;
    save({ manualDurationMinutes: entered });
  }

  return (
    <details className={styles.leg}>
      <summary aria-label={`Leg from ${fromName} to ${toName}`}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M8 2v11M4 9l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span className={styles.travel}>
          {TRAVEL_MODE_NAMES[travelMode]}
          {" · "}
          {durationMinutes === null ? "no travel time yet" : travelTime(durationMinutes)}
          {distanceMeters !== null && ` · ${distance(distanceMeters)}`}
        </span>
        {setByHand && <span className={styles.manual}>Set by hand</span>}
        <span className={styles.change}>Change</span>
      </summary>
      <div className={styles.details} role="group" aria-label={`Leg from ${fromName} to ${toName}`}>
        <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor={`${id}-mode`}>Travel mode</label>
            <select
              id={`${id}-mode`}
              value={chosen?.over === travelMode ? chosen.mode : travelMode}
              disabled={saving}
              onChange={(event) => {
                const mode = event.target.value as Leg["travelMode"];
                setChosen({ mode, over: travelMode });
                save({ travelMode: mode });
              }}
            >
              {TRAVEL_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {TRAVEL_MODE_NAMES[mode]}
                </option>
              ))}
            </select>
          </div>
          {/* Keyed, so the travel time shown follows what the server has. */}
          <fieldset key={`${durationMinutes} ${putBack}`} className={styles.time} onBlur={saveTravelTime}>
            <legend>Travel time</legend>
            <label>
              <input
                ref={hours}
                type="number"
                inputMode="numeric"
                min={0}
                max={720}
                defaultValue={durationMinutes === null ? "" : Math.floor(durationMinutes / 60)}
                onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              />
              h
            </label>
            <label>
              <input
                ref={minutes}
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                defaultValue={durationMinutes === null ? "" : durationMinutes % 60}
                onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              />
              min
            </label>
          </fieldset>
        </div>
        {setByHand && calculatedDurationMinutes !== null && (
          <button
            className={styles.calculated}
            type="button"
            disabled={saving}
            onClick={() => save({ manualDurationMinutes: null })}
          >
            Use the calculated {travelTime(calculatedDurationMinutes)}
          </button>
        )}
        <p className={styles.note} role="status">
          {saving
            ? "Saving…"
            : leg.calculation === null
              ? "Only a Drive is calculated. Enter how long this takes."
              : leg.calculation !== "calculated"
                ? UNCALCULATED[leg.calculation]
                : setByHand
                  ? "The travel time was set by hand."
                  : "The travel time is calculated. Change it to set your own."}
        </p>
        {Object.values(errors).map((error) => (
          <p key={error} className={styles.error} role="alert">
            {error}
          </p>
        ))}
      </div>
    </details>
  );
}
