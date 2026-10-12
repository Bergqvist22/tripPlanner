"use client";

import Link from "next/link";
import { Section } from "@/app/section";
import type { CloseUp } from "@/lib/close-up";
import type { Item } from "@/lib/items";
import { CloseUpMap } from "./close-up-map";
import { DayByDay } from "./day-by-day";
import { ItemList, useShowingRejected } from "./item-list";
import styles from "./page.module.css";

// The Items of a Stop, or those for the whole Trip, each way they are shown:
// on the close-up map of a Stop, day by day, and as a list by Category. All
// show the same Items: Rejected ones are on every one of them or on none.
export function ItemSections({
  tripId,
  stop,
  items,
  displayCurrency,
  displayCosts,
}: {
  tripId: string;
  // The Stop the Items are of, with its close-up map. None for the whole Trip.
  stop?: { id: string; closeUp: CloseUp };
  items: Item[];
  displayCurrency: string;
  displayCosts: Record<string, number>;
}) {
  const rejected = useShowingRejected(items);
  const [showingRejected] = rejected;
  const shown = showingRejected ? items : items.filter((item) => item.status !== "rejected");
  return (
    <>
      {stop && (
        <Section className={styles.route} heading="Map">
          <CloseUpMap tripId={tripId} closeUp={stop.closeUp} showingRejected={showingRejected} />
        </Section>
      )}
      {shown.length > 0 && (
        <Section className={styles.route} heading={stop ? "Day by day" : "Day by day for the whole Trip"}>
          <DayByDay tripId={tripId} items={shown} />
        </Section>
      )}
      <Section className={styles.route} heading={stop ? "Items" : "Items for the whole Trip"}>
        <ItemList
          tripId={tripId}
          items={items}
          displayCurrency={displayCurrency}
          displayCosts={displayCosts}
          empty={
            stop
              ? "No Items yet. Add where you might stay and what you might do here."
              : "No Items yet. Flights, the rental car and anything else that is not tied to one Stop go here."
          }
          rejected={rejected}
        />
        <Link className={styles.add} href={`/trips/${tripId}/items/new${stop ? `?stop=${stop.id}` : ""}`}>
          Add Item
        </Link>
      </Section>
    </>
  );
}
