"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import type { FieldErrors } from "@/lib/trips";
import styles from "./form.module.css";

// How long typing has to pause before what was typed is saved.
const PAUSE_MS = 600;

// What each field holds, as text.
type Fields<Field extends string> = Record<Field, string>;

// What the fields show, next to what was typed in them when they were last
// saved: a field where the two differ has a change that is not saved yet.
// Server is what the server made of that, which can differ from what was
// typed, as a name does once the spaces around it are trimmed.
type Editing<Stored, Field extends string> = {
  stored: Stored;
  typed: Fields<Field>;
  known: Fields<Field>;
  server: Fields<Field>;
};

function unsaved<Field extends string>({ typed, known }: Pick<Editing<unknown, Field>, "typed" | "known">) {
  return (Object.keys(typed) as Field[]).filter((field) => typed[field] !== known[field]);
}

export type SaveState = "saving" | "saved" | "refused" | "failed" | undefined;

// Saves each change to a Trip, Stop or Item as soon as it is made: a choice at
// once, typing when it pauses or the field is left. There is no save button.
export function useAutosave<Stored, Field extends string>({
  url,
  name,
  stored,
  shown,
  entered,
}: {
  // Where the changes are sent, and what the answer calls what it stored.
  url: string;
  name: string;
  // What the server has, which is new whenever the page is refreshed.
  stored: Stored;
  // What each field shows for that.
  shown: (stored: Stored) => Fields<Field>;
  // What is sent for the fields as they are typed.
  entered: (typed: Fields<Field>) => Record<Field, unknown>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing<Stored, Field>>(() => ({
    stored,
    typed: shown(stored),
    known: shown(stored),
    server: shown(stored),
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // The page was refreshed. Where a fellow traveller stored something else
  // meanwhile, a field without a change of its own takes it; one being edited
  // keeps what was typed. A field the server still holds as it did is left as
  // it is, so nothing is rewritten under the traveller typing in it.
  let current = editing;
  if (stored !== editing.stored) {
    const server = shown(stored);
    const typed = { ...editing.typed };
    const known = { ...editing.known };
    for (const field of Object.keys(server) as Field[]) {
      if (server[field] === editing.server[field]) continue;
      if (typed[field] === known[field]) typed[field] = server[field];
      known[field] = server[field];
    }
    current = { stored, typed, known, server };
    setEditing(current);
  }

  // The same, for what runs after the render it was made in.
  const latest = useRef(current);
  useEffect(() => {
    latest.current = current;
  }, [current]);
  const pause = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSave = useRef<Promise<void>>(Promise.resolve());

  function show(next: Editing<Stored, Field>) {
    latest.current = next;
    setEditing(next);
  }

  function change(field: Field, value: string) {
    show({ ...latest.current, typed: { ...latest.current.typed, [field]: value } });
    setFailure(undefined);
    setSaved(false);
  }

  async function send() {
    const { typed } = latest.current;
    let fields = unsaved(latest.current);
    if (fields.length === 0) {
      setErrors({});
      return;
    }
    setSaving(true);
    setFailure(undefined);
    const all = entered(typed);
    let refused: FieldErrors = {};
    let failed: string | undefined;
    try {
      while (fields.length > 0) {
        // Only what changed is sent, so a fellow traveller's change to another
        // field is not undone. Kept alive, so leaving the page does not stop it.
        const response = await fetch(url, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.fromEntries(fields.map((field) => [field, all[field]]))),
          keepalive: true,
        });
        if (response.ok) {
          const answered = shown((await response.json())[name]);
          // More may have been typed meanwhile, which stays unsaved.
          const { known, server } = latest.current;
          const sent = (from: Fields<Field>) => Object.fromEntries(fields.map((field) => [field, from[field]]));
          show({ ...latest.current, known: { ...known, ...sent(typed) }, server: { ...server, ...sent(answered) } });
          router.refresh();
          break;
        }
        if (response.status !== 400) {
          // Locked again or gone: the refreshed page shows which.
          failed = (await response.json().catch(() => undefined))?.error ?? "Try again in a moment.";
          router.refresh();
          break;
        }
        const { errors }: { errors: FieldErrors } = await response.json();
        refused = { ...errors, ...refused };
        // What was refused is left out, so that the rest is still saved.
        const accepted = fields.filter((field) => !(field in errors));
        fields = accepted.length < fields.length ? accepted : [];
      }
    } catch {
      failed = "Check your connection and try again.";
    }
    setErrors(refused);
    setFailure(failed ?? refused.request);
    setSaved(!failed && Object.keys(refused).length === 0);
    setSaving(false);
  }

  // One save at a time, so changes reach the server in the order made.
  function saveNow() {
    clearTimeout(pause.current);
    lastSave.current = lastSave.current.then(send);
  }

  function saveSoon() {
    clearTimeout(pause.current);
    pause.current = setTimeout(saveNow, PAUSE_MS);
  }

  // Switching tabs or closing this one does not wait for the pause.
  const saveBeforeLeaving = useEffectEvent(() => {
    if (document.visibilityState === "hidden") saveNow();
  });
  useEffect(() => {
    const leaving = () => saveBeforeLeaving();
    document.addEventListener("visibilitychange", leaving);
    return () => document.removeEventListener("visibilitychange", leaving);
  }, []);

  const pending = unsaved(current).length > 0;
  let state: SaveState;
  if (failure) state = "failed";
  else if (saving || (pending && Object.keys(errors).length === 0)) state = "saving";
  else if (pending) state = "refused";
  else if (saved) state = "saved";

  return {
    typed: current.typed,
    errors,
    change,
    // For an input, select or textarea of this name: it holds what was typed.
    held: (field: Field) => ({
      name: field,
      value: current.typed[field],
      onChange: (event: { target: { value: string } }) => change(field, event.target.value),
    }),
    // For the form the fields are in. A field's own change is recorded first.
    form: {
      noValidate: true,
      onChange: (event: FormEvent<HTMLFormElement>) =>
        event.target instanceof HTMLSelectElement ? saveNow() : saveSoon(),
      onBlur: saveNow,
      onSubmit: (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        saveNow();
      },
    },
    status: { state, failure, retry: saveNow },
  };
}

// Tells the traveller whether what the fields show is stored. A change that is
// not is never called saved.
export function SaveStatus({ state, failure, retry }: { state: SaveState; failure?: string; retry: () => void }) {
  if (state === "failed") {
    return (
      <div className={styles.unsaved} role="alert">
        <p className={styles.error}>Your changes are not saved. {failure}</p>
        <button className={styles.cancel} type="button" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  if (state === "refused") {
    return (
      <p className={styles.error} role="alert">
        Not everything is saved. Correct what is marked above.
      </p>
    );
  }
  return (
    <p className={styles.saved} role="status">
      {state === "saving" && "Saving…"}
      {state === "saved" && "Saved."}
    </p>
  );
}
