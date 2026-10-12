"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { CATEGORIES, CATEGORY_NAMES } from "@/lib/categories";
import { formattedCost } from "@/lib/currency";
import type { Item } from "@/lib/items";
import type { Status } from "@/lib/statuses";
import { CopyButton } from "./copy-button";
import { StatusPicker } from "./status-picker";
import { formattedDate } from "./stop-dates";
import styles from "./item-list.module.css";

// The price as the Item has it and, for one in another currency, what that
// comes to in the display currency.
export function itemCost({ cost, currency, costBasis }: Item, displayCost: string | undefined) {
  if (cost === null) return undefined;
  const price = [formattedCost(cost, currency), displayCost].filter(Boolean).join(" ≈ ");
  return `${price} ${costBasis === "total" ? "total" : "per person"}`;
}

// The day the Item is on, and when on it, as far as they are known.
export function itemDates({ category, date, time, endDate }: Item) {
  const at = time ? ` at ${time}` : "";
  if (category === "accommodation" && date && endDate) {
    return `Check-in ${formattedDate(date)}${at} · Check-out ${formattedDate(endDate)}`;
  }
  if (date) return `${formattedDate(date)}${at}`;
  return time ? `At ${time}` : undefined;
}

// The site a link leads to, which says more than the whole address.
function site(link: string) {
  return URL.canParse(link) ? new URL(link).hostname.replace(/^www\./, "") : link;
}

// What the group has decided on comes first, then the Suggestions still to
// choose between, next to each other.
const DECIDED_FIRST: readonly Status[] = ["booked", "selected", "suggestion", "rejected"];

function decidedFirst(a: Item, b: Item) {
  return DECIDED_FIRST.indexOf(a.status) - DECIDED_FIRST.indexOf(b.status);
}

// Whether Rejected Items are being shown, and the way to change that. With
// none left to show, the next Item to be Rejected is hidden again.
export function useShowingRejected(items: Item[]) {
  const [showing, setShowing] = useState(false);
  const none = items.every((item) => item.status !== "rejected");
  if (showing && none) setShowing(false);
  return [showing && !none, setShowing] as const;
}

// Items grouped by Category. Rejected Items are left out until asked for;
// `rejected` is for a page that shows the same Items somewhere else as well.
// `displayCosts` holds what the Items priced in another currency cost in the
// display currency, by Item id. `empty` is what to say when there are no Items
// at all.
export function ItemList({
  tripId,
  items,
  displayCurrency,
  displayCosts,
  empty,
  rejected,
}: {
  tripId: string;
  items: Item[];
  displayCurrency: string;
  displayCosts: Record<string, number>;
  empty: string;
  rejected?: ReturnType<typeof useShowingRejected>;
}) {
  const id = useId();
  const own = useShowingRejected(items);
  const [showingRejected, setShowingRejected] = rejected ?? own;
  if (items.length === 0) return <p className={styles.empty}>{empty}</p>;

  const rejectedCount = items.filter((item) => item.status === "rejected").length;
  const shown = showingRejected ? items : items.filter((item) => item.status !== "rejected");

  return (
    <div className={styles.groups}>
      {shown.length === 0 && <p className={styles.empty}>Every Item here is Rejected.</p>}
      {CATEGORIES.map((category) => {
        const group = shown.filter((item) => item.category === category).sort(decidedFirst);
        if (group.length === 0) return null;
        return (
          <section key={category} className={styles.group} aria-labelledby={`${id}-${category}`}>
            <h3 id={`${id}-${category}`}>{CATEGORY_NAMES[category]}</h3>
            <ul className={styles.list}>
              {group.map((item) => {
                const displayCost = displayCosts[item.id];
                const converted = displayCost === undefined ? undefined : formattedCost(displayCost, displayCurrency);
                const facts = [itemCost(item, converted), itemDates(item)].filter(Boolean);
                return (
                  <li key={item.id} className={styles.item}>
                    <Link className={styles.title} href={`/trips/${tripId}/items/${item.id}`}>
                      {item.title}
                    </Link>
                    {facts.length > 0 && <p className={styles.facts}>{facts.join(" · ")}</p>}
                    {item.link && (
                      <a
                        className={styles.link}
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Opens in a new tab"
                      >
                        {site(item.link)} ↗
                      </a>
                    )}
                    {item.bookingReference && (
                      <p className={styles.reference}>
                        <span>Booking reference</span>
                        <code>{item.bookingReference}</code>
                        <CopyButton text={item.bookingReference} />
                      </p>
                    )}
                    {item.notes && <p className={styles.notes}>{item.notes}</p>}
                    <StatusPicker tripId={tripId} item={item} />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {rejectedCount > 0 && (
        <button className={styles.showRejected} type="button" onClick={() => setShowingRejected(!showingRejected)}>
          {showingRejected ? "Hide" : "Show"} {rejectedCount} Rejected
        </button>
      )}
    </div>
  );
}
