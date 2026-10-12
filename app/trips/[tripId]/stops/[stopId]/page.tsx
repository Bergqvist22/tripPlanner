import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { openTrip, unlockCookieName } from "@/lib/access";
import { closeUpOf } from "@/lib/close-up";
import { conversionFor, displayCosts } from "@/lib/budget";
import { listItems } from "@/lib/items";
import { listStops } from "@/lib/stops";
import { isAbout, warningsOf } from "@/lib/warnings";
import { Section } from "@/app/section";
import { ItemSections } from "../../item-sections";
import { KeepOfflineCopy } from "../../keep-offline-copy";
import { stopDates, stopNights } from "../../stop-dates";
import { WarningList } from "../../warning-list";
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
  const [stops, everyItem] = await Promise.all([listStops(trip), listItems(trip)]);
  const stop = stops.find(({ id }) => id === stopId.toLowerCase());
  if (!stop) notFound();
  const items = everyItem.filter((item) => item.stopId === stop.id);
  // Worked out for the whole Trip: an Accommodation elsewhere can cover a
  // night here, or clash with one here.
  const warnings = warningsOf(stops, everyItem).filter((warning) => isAbout(warning, stop.id));
  const conversion = await conversionFor(trip, items);

  return (
    <>
      <KeepOfflineCopy tripId={trip.id} loadedAt={new Date().toISOString()} />
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
          {warnings.length > 0 && (
            <Section className={styles.route} heading="Warnings">
              <WarningList tripId={trip.id} warnings={warnings} summary={false} />
            </Section>
          )}
          <ItemSections
            tripId={trip.id}
            stop={{ id: stop.id, closeUp: closeUpOf(stop, items) }}
            items={items}
            displayCurrency={trip.displayCurrency}
            displayCosts={displayCosts(items, conversion)}
          />
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
