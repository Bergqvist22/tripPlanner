import { Field } from "@/app/field";
import styles from "@/app/form.module.css";
import { CATEGORIES, CATEGORY_NAMES } from "@/lib/categories";
import type { Item } from "@/lib/items";
import type { Stop } from "@/lib/stops";
import type { FieldErrors } from "@/lib/trips";

export type ItemField =
  | "category"
  | "stopId"
  | "title"
  | "date"
  | "endDate"
  | "cost"
  | "currency"
  | "costBasis"
  | "link"
  | "bookingReference"
  | "notes";

// What each field of an Item holds, as text.
export type ItemFieldValues = Record<ItemField, string>;

// What the fields show for an Item, or for the start of a new one.
export function itemShown(item: Partial<Item>): ItemFieldValues {
  return {
    category: item.category ?? "",
    // No Stop means the whole Trip.
    stopId: item.stopId ?? "",
    title: item.title ?? "",
    date: item.date ?? "",
    endDate: item.endDate ?? "",
    cost: item.cost == null ? "" : String(item.cost),
    currency: item.currency ?? "",
    costBasis: item.costBasis ?? "total",
    link: item.link ?? "",
    bookingReference: item.bookingReference ?? "",
    notes: item.notes ?? "",
  };
}

// A cost as typed, with a decimal comma or point. What is not a number is
// sent as typed, for the server to refuse.
function costEntered(typed: string) {
  const cost = typed.trim().replace(",", ".");
  if (cost === "") return null;
  return /^\d+(\.\d+)?$/.test(cost) ? Number(cost) : typed;
}

// What is sent to the server for the fields as they are typed.
export function itemEntered(typed: ItemFieldValues): Record<ItemField, unknown> {
  return {
    ...typed,
    category: typed.category || null,
    stopId: typed.stopId || null,
    // An emptied date means it is not decided yet.
    date: typed.date || null,
    endDate: typed.endDate || null,
    cost: costEntered(typed.cost),
  };
}

// The fields of an Item, for adding one and for editing one.
export function ItemFields({
  typed,
  errors,
  change,
  stops,
  currencies,
  adding = false,
}: {
  typed: ItemFieldValues;
  errors: FieldErrors;
  change: (field: ItemField, value: string) => void;
  stops: Pick<Stop, "id" | "name">[];
  currencies: readonly string[];
  adding?: boolean;
}) {
  // An input, select or textarea of this name, holding what was typed.
  const held = (field: ItemField) => ({
    name: field,
    value: typed[field],
    onChange: (event: { target: { value: string } }) => change(field, event.target.value),
  });

  return (
    <>
      <div className={styles.row}>
        <Field label="Category" error={errors.category}>
          <select {...held("category")} required>
            {adding && <option value="">Choose…</option>}
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_NAMES[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Belongs to" error={errors.stopId}>
          <select {...held("stopId")}>
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
        <input {...held("title")} required maxLength={100} />
      </Field>
      {typed.category === "accommodation" && (
        <div className={styles.row}>
          <Field label="Check-in" error={errors.date}>
            <input {...held("date")} type="date" required />
          </Field>
          <Field label="Check-out" error={errors.endDate}>
            <input {...held("endDate")} type="date" required />
          </Field>
        </div>
      )}
      <div className={styles.row}>
        <Field label="Cost" error={errors.cost}>
          <input {...held("cost")} inputMode="decimal" autoComplete="off" placeholder="Not known yet" />
        </Field>
        <Field label="Currency" error={errors.currency}>
          <select {...held("currency")}>
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
        <select {...held("costBasis")}>
          <option value="total">Total, for the whole group</option>
          <option value="per_person">Per person</option>
        </select>
      </Field>
      <Field label="Link" error={errors.link}>
        <input
          {...held("link")}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={2000}
          placeholder="https://"
        />
      </Field>
      <Field label="Booking reference" error={errors.bookingReference}>
        <input
          {...held("bookingReference")}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={100}
        />
      </Field>
      <Field label="Notes" error={errors.notes}>
        <textarea {...held("notes")} rows={5} maxLength={10000} />
      </Field>
    </>
  );
}
