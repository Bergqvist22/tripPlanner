"use client";

import { SaveStatus, useAutosave } from "@/app/autosave";
import styles from "@/app/form.module.css";
import type { Item } from "@/lib/items";
import type { Stop } from "@/lib/stops";
import { ItemFields, itemEntered, itemShown } from "../item-fields";

// Edits an Item. Each change is saved as it is made.
export function ItemDetailsForm({
  tripId,
  stops,
  currencies,
  item,
}: {
  tripId: string;
  stops: Pick<Stop, "id" | "name">[];
  currencies: readonly string[];
  item: Item;
}) {
  const { typed, errors, change, save, form, status } = useAutosave({
    url: `/api/trips/${tripId}/items/${item.id}`,
    name: "item",
    stored: item,
    shown: itemShown,
    entered: itemEntered,
  });

  return (
    <form className={styles.form} {...form}>
      <ItemFields
        tripId={tripId}
        typed={typed}
        errors={errors}
        change={change}
        onPlaceChosen={save}
        stops={stops}
        currencies={currencies}
      />
      <SaveStatus {...status} />
    </form>
  );
}
