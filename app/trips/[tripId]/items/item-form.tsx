"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Field } from "@/app/field";
import styles from "@/app/form.module.css";
import { CATEGORIES, CATEGORY_NAMES, type Category } from "@/lib/categories";
import type { Item } from "@/lib/items";
import type { Stop } from "@/lib/stops";
import type { FieldErrors } from "@/lib/trips";
import { listedOn } from "./listed-on";

// Where a new Item starts out: under a Stop or on the whole Trip, and priced
// in the Trip's display currency.
type NewItemStart = Pick<Item, "stopId" | "currency">;

// A cost as typed, with a decimal comma or point. What is not a number is
// sent as typed, for the server to refuse.
function costEntered(typed: string) {
  const cost = typed.trim().replace(",", ".");
  if (cost === "") return null;
  return /^\d+(\.\d+)?$/.test(cost) ? Number(cost) : typed;
}

// Adds an Item, or edits the one given.
export function ItemForm({
  tripId,
  stops,
  currencies,
  item,
}: {
  tripId: string;
  stops: Pick<Stop, "id" | "name">[];
  currencies: readonly string[];
  item: Item | NewItemStart;
}) {
  const router = useRouter();
  const existing = "id" in item ? item : undefined;
  const [category, setCategory] = useState<Category | "">(existing?.category ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // What the form's fields were last known to hold on the server. Not the
  // refreshed Item: the fields keep what was typed, so comparing against a
  // fellow traveller's newer value would send theirs back as a change.
  const loaded = useRef(existing);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const entered: Record<string, unknown> = {
      category: category || null,
      title: String(fields.get("title")),
      // No Stop means the whole Trip.
      stopId: String(fields.get("stopId")) || null,
      cost: costEntered(String(fields.get("cost"))),
      currency: String(fields.get("currency")),
      costBasis: String(fields.get("costBasis")),
      link: String(fields.get("link")),
      bookingReference: String(fields.get("bookingReference")),
      notes: String(fields.get("notes")),
    };
    if (category === "accommodation") {
      entered.date = String(fields.get("date")) || null;
      entered.endDate = String(fields.get("endDate")) || null;
    }
    // Of an existing Item only what changed is sent, so a fellow traveller's
    // change to another field is not undone.
    const known = loaded.current;
    const sent = known
      ? Object.fromEntries(Object.entries(entered).filter(([field, value]) => value !== known[field as keyof Item]))
      : entered;
    setSaving(true);
    setSaved(false);
    setErrors({});
    try {
      const response = await fetch(`/api/trips/${tripId}/items${known ? `/${known.id}` : ""}`, {
        method: known ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sent),
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
      if (known) {
        loaded.current = { ...known, ...sent };
        setSaved(true);
      } else {
        const added: Item = (await response.json()).item;
        // This page is kept as it was left, so the next Item starts from an empty form.
        form.reset();
        setCategory("");
        router.push(listedOn(tripId, added.stopId));
      }
      router.refresh();
    } catch {
      setErrors({ request: "The Item could not be saved. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} onChange={() => setSaved(false)} noValidate>
      <div className={styles.row}>
        <Field label="Category" error={errors.category}>
          <select
            name="category"
            value={category}
            onChange={(event) => setCategory(event.target.value as Category | "")}
            required
          >
            {!existing && <option value="">Choose…</option>}
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_NAMES[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Belongs to" error={errors.stopId}>
          <select name="stopId" defaultValue={item.stopId ?? ""}>
            <option value="">The whole Trip</option>
            {stops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Title" error={errors.title}>
        <input name="title" required maxLength={100} defaultValue={existing?.title} />
      </Field>
      {category === "accommodation" && (
        <div className={styles.row}>
          <Field label="Check-in" error={errors.date}>
            <input name="date" type="date" defaultValue={existing?.date ?? ""} required />
          </Field>
          <Field label="Check-out" error={errors.endDate}>
            <input name="endDate" type="date" defaultValue={existing?.endDate ?? ""} required />
          </Field>
        </div>
      )}
      <div className={styles.row}>
        <Field label="Cost" error={errors.cost}>
          <input
            name="cost"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Not known yet"
            defaultValue={existing?.cost ?? ""}
          />
        </Field>
        <Field label="Currency" error={errors.currency}>
          <select name="currency" defaultValue={item.currency}>
            {currencies.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="The cost is"
        error={errors.costBasis}
        hint="Total for a shared hotel room, per person for a flight ticket."
      >
        <select name="costBasis" defaultValue={existing?.costBasis ?? "total"}>
          <option value="total">Total, for the whole group</option>
          <option value="per_person">Per person</option>
        </select>
      </Field>
      <Field label="Link" error={errors.link}>
        <input
          name="link"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={2000}
          placeholder="https://"
          defaultValue={existing?.link}
        />
      </Field>
      <Field label="Booking reference" error={errors.bookingReference}>
        <input
          name="bookingReference"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={100}
          defaultValue={existing?.bookingReference}
        />
      </Field>
      <Field label="Notes" error={errors.notes}>
        <textarea name="notes" rows={5} maxLength={10000} defaultValue={existing?.notes} />
      </Field>
      {errors.request && (
        <p className={styles.error} role="alert">
          {errors.request}
        </p>
      )}
      <button className={styles.submit} type="submit" disabled={saving}>
        {existing ? (saving ? "Saving…" : "Save changes") : saving ? "Adding…" : "Add Item"}
      </button>
      {saved && (
        <p className={styles.saved} role="status">
          Saved.
        </p>
      )}
    </form>
  );
}
