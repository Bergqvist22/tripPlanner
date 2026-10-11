import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { openTrip, unlockCookieName } from "@/lib/access";
import { listItems } from "@/lib/items";
import { findStop } from "@/lib/stops";
import { Section } from "@/app/section";
import { ItemList } from "../../item-list";
import { stopDates, stopNights } from "../../stop-dates";
import styles from "../../page.module.css";
import { DeleteStopForm } from "./delete-stop-form";
import { StopDetailsForm } from "./stop-details-form";

type Props = PageProps<"/trips/[tripId]/stops/[stopId]">;

export default function StopPage({ params }: Props) {
  return (
    <main className={styles.page}>
      <Suspense fallback={<p className={styles.loading}>Loading Stop…</p>}>
        <Stop params={params} />
      </Suspense>
    </main>
  );
}

async function Stop({ params }: Pick<Props, "params">) {
  const { tripId, stopId } = await params;
  const unlock = (await cookies()).get(unlockCookieName(tripId))?.value;
  const opened = await openTrip(tripId, unlock);
  if ("refused" in opened) {
    if (opened.refused === "not-found") notFound();
    // The Trip page asks for the Trip password.
    redirect(`/trips/${tripId}`);
  }

  const { trip } = opened;
  const stop = await findStop(trip, stopId);
  if (!stop) notFound();
  const items = (await listItems(trip)).filter((item) => item.stopId === stop.id);

  return (
    <>
      <Link className={styles.back} href={`/trips/${trip.id}`}>
        ← {trip.name}
      </Link>
      <header className={styles.header}>
        <h1>{stop.name}</h1>
        <p>
          {stopDates(stop)}
          {stop.nights !== null && ` · ${stopNights(stop.nights)}`}
        </p>
      </header>
      <div className={styles.layout}>
        <div className={styles.sections}>
          <Section className={styles.route} heading="Items">
            <ItemList
              tripId={trip.id}
              items={items}
              empty="No Items yet. Add where you might stay and what you might do here."
            />
            <Link className={styles.add} href={`/trips/${trip.id}/items/new?stop=${stop.id}`}>
              Add Item
            </Link>
          </Section>
          <Section className={`${styles.card} ${styles.wide}`} heading="Stop details">
            <StopDetailsForm tripId={trip.id} stop={stop} />
          </Section>
        </div>
        <Section className={styles.card} heading="Delete this Stop">
          <DeleteStopForm tripId={trip.id} stop={stop} itemCount={items.length} />
        </Section>
      </div>
    </>
  );
}
