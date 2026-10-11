import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { openTrip, unlockCookieName } from "@/lib/access";
import { findStop } from "@/lib/stops";
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
        <section className={`${styles.card} ${styles.wide}`} aria-labelledby="details-heading">
          <h2 id="details-heading">Stop details</h2>
          <StopDetailsForm tripId={trip.id} stop={stop} />
        </section>
        <section className={styles.card} aria-labelledby="delete-heading">
          <h2 id="delete-heading">Delete this Stop</h2>
          <DeleteStopForm tripId={trip.id} stop={stop} />
        </section>
      </div>
    </>
  );
}
