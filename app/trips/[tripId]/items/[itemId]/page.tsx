import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { openTrip, unlockCookieName } from "@/lib/access";
import { CATEGORY_NAMES } from "@/lib/categories";
import { CURRENCIES } from "@/lib/currency";
import { findItem } from "@/lib/items";
import { STATUS_NAMES } from "@/lib/statuses";
import { listStops } from "@/lib/stops";
import { Section } from "@/app/section";
import styles from "../../page.module.css";
import { StatusPicker } from "../../status-picker";
import { ItemForm } from "../item-form";
import { listedOn } from "../listed-on";
import { DeleteItemForm } from "./delete-item-form";

type Props = PageProps<"/trips/[tripId]/items/[itemId]">;

export default function ItemPage({ params }: Props) {
  return (
    <main className={styles.page}>
      <Suspense fallback={<p className={styles.loading}>Loading Item…</p>}>
        <Item params={params} />
      </Suspense>
    </main>
  );
}

async function Item({ params }: Pick<Props, "params">) {
  const { tripId, itemId } = await params;
  const unlock = (await cookies()).get(unlockCookieName(tripId))?.value;
  const opened = await openTrip(tripId, unlock);
  if ("refused" in opened) {
    if (opened.refused === "not-found") notFound();
    // The Trip page asks for the Trip password.
    redirect(`/trips/${tripId}`);
  }

  const { trip } = opened;
  const item = await findItem(trip, itemId);
  if (!item) notFound();
  const stops = await listStops(trip);
  const stop = stops.find(({ id }) => id === item.stopId);

  return (
    <>
      <Link className={styles.back} href={listedOn(trip.id, item.stopId)}>
        ← {stop?.name ?? trip.name}
      </Link>
      <header className={styles.header}>
        <h1>{item.title}</h1>
        <p>
          {CATEGORY_NAMES[item.category]} · {STATUS_NAMES[item.status]} ·{" "}
          {stop ? `At ${stop.name}` : "For the whole Trip"}
        </p>
      </header>
      <div className={styles.layout}>
        <Section className={`${styles.card} ${styles.wide}`} heading="Item details">
          <ItemForm
            tripId={trip.id}
            stops={stops.map(({ id, name }) => ({ id, name }))}
            currencies={CURRENCIES}
            item={item}
          />
        </Section>
        <div className={styles.sections}>
          <Section className={styles.card} heading="Status">
            <StatusPicker tripId={trip.id} item={item} />
          </Section>
          <Section className={styles.card} heading="Delete this Item">
            <DeleteItemForm tripId={trip.id} item={item} />
          </Section>
        </div>
      </div>
    </>
  );
}
