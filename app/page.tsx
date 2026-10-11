import Link from "next/link";
import { Suspense } from "react";
import { CURRENCIES } from "@/lib/currency";
import { listTrips } from "@/lib/trips";
import { Section } from "@/app/section";
import { CreateTripForm } from "./create-trip-form";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Trip Planner</h1>
        <p>Plan the route, compare what to book and see what it costs, together.</p>
      </header>

      <Section className={styles.trips} heading="Trips">
        <Suspense fallback={<p className={styles.empty}>Loading Trips…</p>}>
          <TripList />
        </Suspense>
      </Section>

      <Section className={styles.create} heading="Start a new Trip">
        <CreateTripForm currencies={CURRENCIES} />
      </Section>
    </main>
  );
}

async function TripList() {
  const trips = await listTrips();
  if (trips.length === 0) {
    return <p className={styles.empty}>No Trips yet. Start the first one.</p>;
  }
  return (
    <ul className={styles.list}>
      {trips.map((trip) => (
        <li key={trip.id}>
          <Link className={styles.trip} href={`/trips/${trip.id}`}>
            <span className={styles.tripName}>{trip.name}</span>
            <span className={styles.tripCreator}>Created by {trip.creatorName}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
