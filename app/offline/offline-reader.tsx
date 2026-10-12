"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { CATEGORY_NAMES } from "@/lib/categories";
import { formattedCost } from "@/lib/currency";
import type { Item } from "@/lib/items";
import type { OfflineCopy } from "@/lib/offline-copy";
import { STATUS_NAMES } from "@/lib/statuses";
import type { Stop } from "@/lib/stops";
import { TRAVEL_MODE_NAMES } from "@/lib/travel-modes";
import { Section } from "@/app/section";
import { itemCost, itemDates } from "@/app/trips/[tripId]/item-list";
import { listedOn } from "@/app/trips/[tripId]/items/listed-on";
import page from "@/app/trips/[tripId]/page.module.css";
import { stopDates, stopNights } from "@/app/trips/[tripId]/stop-dates";
import { travelTime } from "@/app/trips/[tripId]/travel";
import { keptCopyText, readerFor, serverAnswers, type KeptCopy } from "./kept";
import styles from "./offline-reader.module.css";

// The page of a Trip the reader stands in for, which follows the # in its
// address: the Trip's own, a Stop's or an Item's.
function useTripPage() {
  return useSyncExternalStore(
    (changed) => {
      window.addEventListener("hashchange", changed);
      return () => window.removeEventListener("hashchange", changed);
    },
    () => window.location.hash.slice(1),
    () => undefined,
  );
}

// The Trip's offline copy on this device. Undefined until the device has been
// asked, null when it has none.
function useKeptCopy(tripId: string | undefined) {
  const text = useSyncExternalStore(
    (changed) => {
      window.addEventListener("storage", changed);
      return () => window.removeEventListener("storage", changed);
    },
    () => (tripId ? keptCopyText(tripId) : null),
    () => undefined,
  );
  return useMemo(() => {
    if (text === undefined || text === null) return text;
    try {
      return JSON.parse(text) as KeptCopy;
    } catch {
      return null;
    }
  }, [text]);
}

const MINUTE_MS = 60 * 1000;

// How often the reader asks whether the server can be reached again.
const ASK_AGAIN_MS = 15 * 1000;

// The time, to the minute and told again every minute, for saying how old the
// copy is.
function useNow() {
  return useSyncExternalStore(
    (changed) => {
      const tick = setInterval(changed, MINUTE_MS);
      return () => clearInterval(tick);
    },
    () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS,
    () => 0,
  );
}

function ago(amount: number, unit: string) {
  return `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
}

// How old the copy is, as travellers say it.
function loadedAgo(loadedAt: string, now: number) {
  const minutes = Math.floor((now - Date.parse(loadedAt)) / MINUTE_MS);
  if (minutes < 1) return "less than a minute ago";
  if (minutes < 60) return ago(minutes, "minute");
  if (minutes < 24 * 60) return ago(Math.floor(minutes / 60), "hour");
  return ago(Math.floor(minutes / (24 * 60)), "day");
}

const dayAndTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

// Shows the offline copy of a Trip, to read: nothing in it can be edited.
// When the connection returns it gives way to the page it stands in for,
// loaded again.
export function OfflineReader() {
  const tripPage = useTripPage();
  const [, tripId, kind, id] = tripPage?.toLowerCase().match(/^\/trips\/([^/]+)(?:\/(stops|items)\/([^/]+))?/) ?? [];
  const kept = useKeptCopy(tripId);
  const now = useNow();

  // The browser tells when it has a connection again, but not when the server
  // can be reached again, so that is asked now and then as well.
  useEffect(() => {
    if (!tripPage?.startsWith("/trips/")) return;
    const load = async () => {
      if (await serverAnswers()) window.location.replace(tripPage);
    };
    load();
    window.addEventListener("online", load);
    const again = setInterval(load, ASK_AGAIN_MS);
    return () => {
      window.removeEventListener("online", load);
      clearInterval(again);
    };
  }, [tripPage]);

  if (tripPage === undefined || kept === undefined) return null;
  if (!kept) {
    return (
      <main className={page.page}>
        <Notice tripPage={tripId ? tripPage : "/"} heading="Nothing to read offline">
          <p>
            This device has no offline copy of this Trip. A Trip is kept on a device each time it is opened there with
            a connection.
          </p>
        </Notice>
      </main>
    );
  }

  const { copy, loadedAt } = kept;
  const stop = kind === "stops" ? copy.stops.find((stop) => stop.id === id) : undefined;
  const item = kind === "items" ? copy.items.find((item) => item.id === id) : undefined;
  return (
    <main className={page.page}>
      <Notice tripPage={tripPage} heading="Offline copy">
        <p>
          You have no connection. This is the copy of the Trip kept on this device, loaded{" "}
          <time dateTime={loadedAt} title={dayAndTime.format(new Date(loadedAt))}>
            {loadedAgo(loadedAt, now)}
          </time>{" "}
          ({dayAndTime.format(new Date(loadedAt))}). It may have changed since.
        </p>
        <p>Editing is off while you are offline, as nothing could be saved. The maps need a connection too.</p>
      </Notice>
      {stop ? (
        <StopCopy copy={copy} stop={stop} />
      ) : item ? (
        <ItemCopy copy={copy} item={item} />
      ) : (
        <TripCopy copy={copy} />
      )}
    </main>
  );
}

// Says that this is not the Trip itself, and lets the traveller try for it.
function Notice({ tripPage, heading, children }: { tripPage: string; heading: string; children: React.ReactNode }) {
  return (
    <div className={styles.notice} role="status">
      <strong>{heading}</strong>
      {children}
      <button className={styles.again} type="button" onClick={() => window.location.assign(tripPage)}>
        Try the connection again
      </button>
    </div>
  );
}

function Back({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <a className={page.back} href={readerFor(to)}>
      ← {children}
    </a>
  );
}

function TripCopy({ copy }: { copy: OfflineCopy }) {
  const { trip, stops, legs, budget } = copy;
  const cost = (amount: number) => formattedCost(amount, budget.displayCurrency);
  return (
    <>
      <header className={page.header}>
        <h1>{trip.name}</h1>
        <p>Created by {trip.creatorName}</p>
      </header>
      <dl className={page.facts}>
        <div>
          <dt>Travellers</dt>
          <dd>{trip.travellerCount}</dd>
        </div>
        <div>
          <dt>Budget</dt>
          <dd>{cost(budget.total)}</dd>
        </div>
        <div>
          <dt>Per person</dt>
          <dd>{cost(budget.perPerson)}</dd>
        </div>
      </dl>
      <Section className={page.route} heading="Route">
        {stops.length === 0 && <p className={styles.muted}>No Stops yet.</p>}
        <ol className={styles.list}>
          {stops.map((stop, index) => {
            const leg = legs.find((leg) => leg.fromStopId === stops[index - 1]?.id && leg.toStopId === stop.id);
            const itemCount = copy.items.filter((item) => item.stopId === stop.id).length;
            return (
              <li key={stop.id} className={styles.stop}>
                {leg && (
                  <p className={styles.leg}>
                    {TRAVEL_MODE_NAMES[leg.travelMode]}
                    {leg.durationMinutes !== null && ` · ${travelTime(leg.durationMinutes)}`}
                  </p>
                )}
                <a className={styles.entry} href={readerFor(listedOn(trip.id, stop.id))}>
                  <h3>{stop.name}</h3>
                  <p className={styles.muted}>
                    {stopDates(stop)}
                    {stop.nights !== null && ` · ${stopNights(stop.nights)}`} · {itemCount}{" "}
                    {itemCount === 1 ? "Item" : "Items"}
                  </p>
                  {stop.place && <p>{stop.place.label}</p>}
                </a>
              </li>
            );
          })}
        </ol>
      </Section>
      <Section className={page.route} heading="Items for the whole Trip">
        <ItemCopies copy={copy} items={copy.items.filter((item) => item.stopId === null)} />
      </Section>
    </>
  );
}

function StopCopy({ copy, stop }: { copy: OfflineCopy; stop: Stop }) {
  return (
    <>
      <Back to={listedOn(copy.trip.id, null)}>{copy.trip.name}</Back>
      <header className={page.header}>
        <h1>{stop.name}</h1>
        <p>
          {stopDates(stop)}
          {stop.nights !== null && ` · ${stopNights(stop.nights)}`}
        </p>
      </header>
      {(stop.place || stop.notes) && (
        <div className={styles.entry}>
          <dl>
            {stop.place && <Detail name="Place">{stop.place.label}</Detail>}
            {stop.notes && <Detail name="Notes"><span className={styles.notes}>{stop.notes}</span></Detail>}
          </dl>
        </div>
      )}
      <Section className={page.route} heading="Items">
        <ItemCopies copy={copy} items={copy.items.filter((item) => item.stopId === stop.id)} />
      </Section>
    </>
  );
}

function ItemCopy({ copy, item }: { copy: OfflineCopy; item: Item }) {
  const stop = copy.stops.find(({ id }) => id === item.stopId);
  return (
    <>
      <Back to={listedOn(copy.trip.id, item.stopId)}>{stop?.name ?? copy.trip.name}</Back>
      <ItemCopies copy={copy} items={[item]} />
    </>
  );
}

function Detail({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{name}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// Each Item with all there is to read about it, in the order they were added.
function ItemCopies({ copy, items }: { copy: OfflineCopy; items: Item[] }) {
  if (items.length === 0) return <p className={styles.muted}>No Items yet.</p>;
  return (
    <ul className={styles.list}>
      {items.map((item) => {
        const displayCost = copy.displayCosts[item.id];
        const converted =
          displayCost === undefined ? undefined : formattedCost(displayCost, copy.budget.displayCurrency);
        const cost = itemCost(item, converted);
        const dates = itemDates(item);
        return (
          <li key={item.id} className={styles.entry}>
            <h3>{item.title}</h3>
            <p className={styles.muted}>
              {CATEGORY_NAMES[item.category]} · {STATUS_NAMES[item.status]}
            </p>
            <dl>
              {dates && <Detail name="When">{dates}</Detail>}
              {cost && <Detail name="Cost">{cost}</Detail>}
              {item.place && <Detail name="Place">{item.place.label}</Detail>}
              {item.bookingReference && (
                <Detail name="Booking reference">
                  <code>{item.bookingReference}</code>
                </Detail>
              )}
              {item.link && (
                <Detail name="Link">
                  <a href={item.link} target="_blank" rel="noopener noreferrer" title="Opens in a new tab">
                    {item.link}
                  </a>
                </Detail>
              )}
              {item.notes && <Detail name="Notes"><span className={styles.notes}>{item.notes}</span></Detail>}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
