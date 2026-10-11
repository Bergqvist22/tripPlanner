"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import formStyles from "@/app/form.module.css";
import type { Place } from "@/lib/place-search";
import styles from "./place-field.module.css";

// How long typing has to pause before it is searched for.
const PAUSE_MS = 400;

type Search =
  | { state: "idle" | "searching" | "failed" }
  // What was found, and for which words.
  | { state: "found"; query: string; places: Place[] };

// Where a Stop is on the map: the place chosen for it, or a search for one.
// A place is never needed, so a search that fails holds nothing back.
export function PlaceField({
  tripId,
  place,
  error,
  onChange,
}: {
  tripId: string;
  place: Place | null;
  error?: string;
  // Told the place that was chosen, or null when it is taken away.
  onChange: (place: Place | null) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<Search>({ state: "idle" });
  const pause = useRef<ReturnType<typeof setTimeout>>(undefined);
  const asked = useRef<AbortController>(undefined);

  function forget() {
    clearTimeout(pause.current);
    asked.current?.abort();
  }
  useEffect(() => forget, []);

  async function find(typed: string) {
    forget();
    const words = typed.trim();
    if (words.length < 2) {
      setSearch({ state: "idle" });
      return;
    }
    const controller = new AbortController();
    asked.current = controller;
    setSearch({ state: "searching" });
    try {
      const response = await fetch(`/api/trips/${tripId}/places?${new URLSearchParams({ q: words })}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Place search answered ${response.status}`);
      const { places }: { places: Place[] } = await response.json();
      setSearch({ state: "found", query: words, places });
    } catch {
      // A search that was overtaken by the next one says nothing.
      if (!controller.signal.aborted) setSearch({ state: "failed" });
    }
  }

  function type(typed: string) {
    setQuery(typed);
    forget();
    setSearch({ state: "idle" });
    pause.current = setTimeout(() => find(typed), PAUSE_MS);
  }

  // Enter searches at once, rather than sending the form the field is in.
  function searchOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    find(query);
  }

  function choose(chosen: Place | null) {
    forget();
    setQuery("");
    setSearch({ state: "idle" });
    onChange(chosen);
  }

  return (
    <div className={formStyles.field}>
      <label htmlFor={id}>Place</label>
      {place && (
        <p className={styles.chosen}>
          <span>{place.label}</span>
          <button className={styles.remove} type="button" onClick={() => choose(null)}>
            Remove place
          </button>
        </p>
      )}
      <input
        id={id}
        type="search"
        value={query}
        maxLength={200}
        autoComplete="off"
        placeholder={place ? "Search for another place" : "Search for a town, an address, a sight…"}
        onChange={(event) => type(event.target.value)}
        onKeyDown={searchOnEnter}
      />
      {search.state === "found" && search.places.length > 0 && (
        <ul className={styles.found} aria-label="Search results">
          {search.places.map((found, index) => (
            <li key={index}>
              <button type="button" onClick={() => choose(found)}>
                {found.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={formStyles.hint} role="status">
        {search.state === "idle" && !place && !error && "Puts the Stop on the map. It can be left out."}
        {search.state === "searching" && "Searching…"}
        {search.state === "found" && search.places.length === 0 && `No place found for “${search.query}”.`}
        {search.state === "failed" &&
          "Place search is not available right now. The Stop works without a place, so you can add one later."}
      </p>
      {error && (
        <p className={formStyles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
