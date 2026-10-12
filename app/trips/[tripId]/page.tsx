import { cookies } from "next/headers";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { openTrip, unlockCookieName } from "@/lib/access";
import { budgetOf, conversionFor, displayCosts } from "@/lib/budget";
import { CURRENCIES } from "@/lib/currency";
import { listItems } from "@/lib/items";
import { legsOf, travelOf } from "@/lib/legs";
import { listRecentlyDeleted } from "@/lib/recently-deleted";
import { routeOf } from "@/lib/route";
import { listStops } from "@/lib/stops";
import { findTripSummary } from "@/lib/trips";
import { warningsOf } from "@/lib/warnings";
import { Section } from "@/app/section";
import { AddStopForm } from "./add-stop-form";
import { Budget } from "./budget";
import { DeleteTripForm } from "./delete-trip-form";
import { ItemSections } from "./item-sections";
import { KeepOfflineCopy } from "./keep-offline-copy";
import { RecentlyDeleted } from "./recently-deleted";
import { RouteMap } from "./route-map";
import { StopList } from "./stop-list";
import { travelTime } from "./travel";
import { TripDetailsForm } from "./trip-details-form";
import { UnlockForm } from "./unlock-form";
import { WarningList } from "./warning-list";
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
        {/* Locked again: the offline copy kept on this device is let go. */}
        <KeepOfflineCopy tripId={tripId} loadedAt={new Date().toISOString()} />
        <TripHeader name={summary.name} creatorName={summary.creatorName} />
        <Section className={styles.card} heading="This Trip is locked">
          <p className={styles.lead}>Enter the Trip password to open it. This browser will remember it.</p>
          <UnlockForm tripId={tripId} />
        </Section>
      </>
    );
  }

  const { trip } = opened;
  const [stops, items, deleted] = await Promise.all([listStops(trip), listItems(trip), listRecentlyDeleted(trip)]);
  // Exchange rates and drives are asked of their services for a traveller
  // reading the Trip, not for a prefetch of the page: that is abandoned halfway,
  // which would pass for the service failing.
  await connection();
  const [conversion, legs] = await Promise.all([conversionFor(trip, items), legsOf(stops)]);
  const travel = travelOf(legs);
  const warnings = warningsOf(stops, items);
  return (
    <>
      <KeepOfflineCopy tripId={trip.id} loadedAt={new Date().toISOString()} />
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
        {travel.legs.length > 0 && (
          <div>
            <dt>Travel time</dt>
            <dd>
              {travel.legsWithoutTravelTime < travel.legs.length ? travelTime(travel.totalTravelMinutes) : "Not known yet"}
              {travel.legsWithoutTravelTime > 0 && travel.legsWithoutTravelTime < travel.legs.length && (
                <small>
                  {" "}
                  and {travel.legsWithoutTravelTime} {travel.legsWithoutTravelTime === 1 ? "Leg" : "Legs"} without a
                  travel time
                </small>
              )}
            </dd>
          </div>
        )}
      </dl>
      <div className={styles.layout}>
        <div className={styles.sections}>
          {warnings.length > 0 && (
            <Section className={styles.route} heading="Warnings">
              <WarningList tripId={trip.id} warnings={warnings} summary />
            </Section>
          )}
          <Section className={styles.route} heading="Map">
            <RouteMap tripId={trip.id} route={routeOf(stops, legs)} />
          </Section>
          <Section className={styles.route} heading="Route">
            <StopList tripId={trip.id} stops={stops} legs={travel.legs} />
            <div className={styles.card}>
              <AddStopForm tripId={trip.id} />
            </div>
          </Section>
          <ItemSections
            tripId={trip.id}
            items={items.filter((item) => item.stopId === null)}
            displayCurrency={trip.displayCurrency}
            displayCosts={displayCosts(items, conversion)}
          />
        </div>
        <div className={styles.sections}>
          <Section className={styles.card} heading="Budget">
            <Budget budget={budgetOf(trip, stops, items, conversion)} />
          </Section>
          <Section className={styles.card} heading="Trip details">
            <TripDetailsForm trip={trip} currencies={CURRENCIES} />
          </Section>
          {deleted.stops.length + deleted.items.length > 0 && (
            <Section className={styles.card} heading="Recently deleted">
              <p className={styles.lead}>Deleted Stops and Items can be restored for 30 days.</p>
              <RecentlyDeleted tripId={trip.id} deleted={deleted} />
            </Section>
          )}
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
