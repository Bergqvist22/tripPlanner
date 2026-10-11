"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import styles from "@/app/form.module.css";
import type { Item } from "@/lib/items";
import type { Stop } from "@/lib/stops";
import type { FieldErrors } from "@/lib/trips";
import { ItemFields, itemEntered, itemShown, type ItemField } from "../item-fields";
import { listedOn } from "../listed-on";

// Adds an Item. It starts out under a Stop or on the whole Trip, and priced in
// the Trip's display currency.
export function NewItemForm({
  tripId,
  stops,
  currencies,
  start,
}: {
  tripId: string;
  stops: Pick<Stop, "id" | "name">[];
  currencies: readonly string[];
  start: Pick<Item, "stopId" | "currency">;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState(() => itemShown(start));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [adding, setAdding] = useState(false);

  function change(field: ItemField, value: string) {
    setTyped((typed) => ({ ...typed, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { date, endDate, ...entered } = itemEntered(typed);
    setAdding(true);
    setErrors({});
    try {
      const response = await fetch(`/api/trips/${tripId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Only an Accommodation shows its dates, so only it has any.
        body: JSON.stringify(typed.category === "accommodation" ? { ...entered, date, endDate } : entered),
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
      const added: Item = (await response.json()).item;
      // This page is kept as it was left, so the next Item starts from an empty form.
      setTyped(itemShown(start));
      router.push(listedOn(tripId, added.stopId));
      router.refresh();
    } catch {
      setErrors({ request: "The Item could not be added. Check your connection and try again." });
    } finally {
      setAdding(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <ItemFields typed={typed} errors={errors} change={change} stops={stops} currencies={currencies} adding />
      {errors.request && (
        <p className={styles.error} role="alert">
          {errors.request}
        </p>
      )}
      <button className={styles.submit} type="submit" disabled={adding}>
        {adding ? "Adding…" : "Add Item"}
      </button>
    </form>
  );
}
