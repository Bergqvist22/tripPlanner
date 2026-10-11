import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { openTrip, unlockCookieName } from "@/lib/access";
import { budgetOf, conversionFor, displayCosts } from "@/lib/budget";
import { CURRENCIES } from "@/lib/currency";
import { listItems } from "@/lib/items";
import { listStops } from "@/lib/stops";
import { findTripSummary } from "@/lib/trips";
import { Section } from "@/app/section";
import { AddStopForm } from "./add-stop-form";
import { Budget } from "./budget";
import { DeleteTripForm } from "./delete-trip-form";
import { ItemList } from "./item-list";
import { StopList } from "./stop-list";
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
        <Section className={styles.card} heading="This Trip is locked">
          <p className={styles.lead}>Enter the Trip password to open it. This browser will remember it.</p>
          <UnlockForm tripId={tripId} />
        </Section>
      </>
    );
  }

  const { trip } = opened;
  const [stops, items] = await Promise.all([listStops(trip), listItems(trip)]);
  const conversion = await conversionFor(trip, items);
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
      <div className={styles.layout}>
        <div className={styles.sections}>
          <Section className={styles.route} heading="Route">
            <StopList tripId={trip.id} stops={stops} />
            <div className={styles.card}>
              <AddStopForm tripId={trip.id} />
            </div>
          </Section>
          <Section className={styles.route} heading="Items for the whole Trip">
            <ItemList
              tripId={trip.id}
              items={items.filter((item) => item.stopId === null)}
              displayCurrency={trip.displayCurrency}
              displayCosts={displayCosts(items, conversion)}
              empty="No Items yet. Flights, the rental car and anything else that is not tied to one Stop go here."
            />
            <Link className={styles.add} href={`/trips/${trip.id}/items/new`}>
              Add Item
            </Link>
          </Section>
        </div>
        <div className={styles.sections}>
          <Section className={styles.card} heading="Budget">
            <Budget budget={budgetOf(trip, stops, items, conversion)} />
          </Section>
          <Section className={styles.card} heading="Trip details">
            <TripDetailsForm trip={trip} currencies={CURRENCIES} />
          </Section>
          <Section className={styles.card} heading="Delete this Trip">
            <p className={styles.lead}>
              This removes the Trip and everything in it for good. Enter the Trip password to confirm.
            </p>
            <DeleteTripForm tripId={trip.id} />
          </Section>
        </div>
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
