import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { openTrip, unlockCookieName } from "@/lib/access";
import { CURRENCIES } from "@/lib/currency";
import { listStops } from "@/lib/stops";
import styles from "../../page.module.css";
import { listedOn } from "../listed-on";
import { NewItemForm } from "./new-item-form";

type Props = PageProps<"/trips/[tripId]/items/new">;

export default function NewItemPage(props: Props) {
  return (
    <main className={styles.page}>
      <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
        <NewItem {...props} />
      </Suspense>
    </main>
  );
}

async function NewItem({ params, searchParams }: Props) {
  const { tripId } = await params;
  const unlock = (await cookies()).get(unlockCookieName(tripId))?.value;
  const opened = await openTrip(tripId, unlock);
  if ("refused" in opened) {
    if (opened.refused === "not-found") notFound();
    // The Trip page asks for the Trip password.
    redirect(`/trips/${tripId}`);
  }

  const { trip } = opened;
  const stops = await listStops(trip);
  // The Stop whose page the traveller came from, if any.
  const cameFrom = (await searchParams).stop;
  const stop = stops.find(({ id }) => id === cameFrom);

  return (
    <>
      <Link className={styles.back} href={listedOn(trip.id, stop?.id ?? null)}>
        ← {stop?.name ?? trip.name}
      </Link>
      <header className={styles.header}>
        <h1>New Item</h1>
        <p>Anything you might book or do. A Category and a title are enough to begin with.</p>
      </header>
      <section className={`${styles.card} ${styles.wide}`} aria-label="New Item">
        <NewItemForm
          // A fresh form for each place an Item is added from.
          key={stop?.id ?? "trip"}
          tripId={trip.id}
          stops={stops.map(({ id, name }) => ({ id, name }))}
          currencies={CURRENCIES}
          start={{ stopId: stop?.id ?? null, currency: trip.displayCurrency }}
        />
      </section>
    </>
  );
}
