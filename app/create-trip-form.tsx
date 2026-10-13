"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { FieldErrors } from "@/lib/trips";
import { Field } from "./field";
import styles from "./form.module.css";

export function CreateTripForm({ currencies }: { currencies: readonly string[] }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setSaving(true);
    setErrors({});
    try {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fields.get("name"),
          creatorName: fields.get("creatorName"),
          password: fields.get("password"),
          travellerCount: Number(fields.get("travellerCount")),
          displayCurrency: fields.get("displayCurrency"),
        }),
      });
      if (response.status === 400) {
        setErrors((await response.json()).errors);
        return;
      }
      if (!response.ok) throw new Error(`Unexpected status ${response.status}`);
      form.reset();
      router.refresh();
    } catch {
      setErrors({ request: "The Trip could not be created. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Field label="Trip name" error={errors.name}>
        <input name="name" required maxLength={100} placeholder="California road trip" />
      </Field>
      <Field label="Your name" error={errors.creatorName}>
        <input name="creatorName" required maxLength={100} autoComplete="name" />
      </Field>
      <Field
        label="Trip password"
        error={errors.password}
        hint="Optional. With one, only those you share it with can open the Trip, and it cannot be recovered if lost. Without one, anyone can open and change the Trip."
      >
        <input name="password" type="password" maxLength={200} autoComplete="new-password" />
      </Field>
      <div className={styles.row}>
        <Field label="Travellers" error={errors.travellerCount}>
          <input
            name="travellerCount"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            defaultValue={2}
            required
          />
        </Field>
        <Field label="Display currency" error={errors.displayCurrency}>
          <select name="displayCurrency" defaultValue="EUR" required>
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
        {saving ? "Creating…" : "Create Trip"}
      </button>
    </form>
  );
}
