import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { openTrip, unlockCookieName } from "@/lib/access";
import { CURRENCIES } from "@/lib/currency";
import { findTripSummary } from "@/lib/trips";
import { DeleteTripForm } from "./delete-trip-form";
import { TripDetailsForm } from "./trip-details-form";
import { UnlockForm } from "./unlock-form";
import styles from "./page.module.css";

export default function TripPage({ params }: PageProps<"/trips/[tripId]">) {
  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/">
        ← All Trips
      </Link>
      <Suspense fallback={<p className={styles.loading}>Loading Trip…</p>}>
        <Trip params={params} />
      </Suspense>
    </main>
  );
}

async function Trip({ params }: Pick<PageProps<"/trips/[tripId]">, "params">) {
  const { tripId } = await params;
  const unlock = (await cookies()).get(unlockCookieName(tripId))?.value;
  const opened = await openTrip(tripId, unlock);

  if ("refused" in opened) {
    // Without the Trip password only the name and creator name are shown.
    const summary = await findTripSummary(tripId);
    if (!summary) notFound();
    return (
      <>
        <TripHeader name={summary.name} creatorName={summary.creatorName} />
        <section className={styles.card} aria-labelledby="unlock-heading">
          <h2 id="unlock-heading">This Trip is locked</h2>
          <p className={styles.lead}>Enter the Trip password to open it. This browser will remember it.</p>
          <UnlockForm tripId={tripId} />
        </section>
      </>
    );
  }

  const { trip } = opened;
  return (
    <>
      <TripHeader name={trip.name} creatorName={trip.creatorName} />
      <dl className={styles.facts}>
        <div>
          <dt>Travellers</dt>
          <dd>{trip.travellerCount}</dd>
        </div>
        <div>
          <dt>Display currency</dt>
          <dd>{trip.displayCurrency}</dd>
        </div>
      </dl>
      <div className={styles.sections}>
        <section className={styles.card} aria-labelledby="details-heading">
          <h2 id="details-heading">Trip details</h2>
          <TripDetailsForm trip={trip} currencies={CURRENCIES} />
        </section>
        <section className={styles.card} aria-labelledby="delete-heading">
          <h2 id="delete-heading">Delete this Trip</h2>
          <p className={styles.lead}>
            This removes the Trip and everything in it for good. Enter the Trip password to confirm.
          </p>
          <DeleteTripForm tripId={trip.id} />
        </section>
      </div>
    </>
  );
}

function TripHeader({ name, creatorName }: { name: string; creatorName: string }) {
  return (
    <header className={styles.header}>
      <h1>{name}</h1>
      <p>Created by {creatorName}</p>
    </header>
  );
}
