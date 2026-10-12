"use client";

import Link from "next/link";
import { Section } from "@/app/section";
import type { CloseUp } from "@/lib/close-up";
import type { Item } from "@/lib/items";
import { CloseUpMap } from "../../close-up-map";
import { ItemList, useShowingRejected } from "../../item-list";
import styles from "../../page.module.css";

// The Items of a Stop, on its close-up map and as a list. The two show the
// same Items: Rejected ones are on both or on neither.
export function StopItems({
  tripId,
  stopId,
  closeUp,
  items,
  displayCurrency,
  displayCosts,
}: {
  tripId: string;
  stopId: string;
  closeUp: CloseUp;
  items: Item[];
  displayCurrency: string;
  displayCosts: Record<string, number>;
}) {
  const rejected = useShowingRejected(items);
  const [showingRejected] = rejected;
  return (
    <>
      <Section className={styles.route} heading="Map">
        <CloseUpMap tripId={tripId} closeUp={closeUp} showingRejected={showingRejected} />
      </Section>
      <Section className={styles.route} heading="Items">
        <ItemList
          tripId={tripId}
          items={items}
          displayCurrency={displayCurrency}
          displayCosts={displayCosts}
          empty="No Items yet. Add where you might stay and what you might do here."
          rejected={rejected}
        />
        <Link className={styles.add} href={`/trips/${tripId}/items/new?stop=${stopId}`}>
          Add Item
        </Link>
      </Section>
    </>
  );
}
