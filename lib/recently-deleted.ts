import { and, asc, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { items, stops } from "@/db/schema";
import { z } from "zod";
import type { Category } from "./categories";
import { itemContents, type Item } from "./items";
import { stopContents, stopStaysOnRoute, type Stop } from "./stops";
import type { Trip } from "./trips";

// A deleted Stop or Item stays in Recently deleted for 30 days. After that it
// is neither listed nor restorable, and the scheduled job purges it.
export const RESTORABLE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// What was deleted before this moment is gone for good.
function restorableSince() {
  return new Date(Date.now() - RESTORABLE_DAYS * DAY_MS);
}

function when(deletedAt: Date) {
  const daysAgo = Math.floor((Date.now() - deletedAt.getTime()) / DAY_MS);
  return { deletedAt: deletedAt.toISOString(), daysLeft: RESTORABLE_DAYS - daysAgo };
}

type Deleted = {
  id: string;
  deletedAt: string;
  // Whole days until it is gone for good, counting the one that has begun.
  daysLeft: number;
};

// The Items that were deleted with a Stop are restored with it, and counted
// here rather than listed on their own.
export type DeletedStop = Deleted & { name: string; itemCount: number };

// The Stop is the one the Item was on, if any. While that Stop is not on the
// Route, restoring the Item puts it on the Trip as a whole.
export type DeletedItem = Deleted & {
  title: string;
  category: Category;
  stop: { id: string; name: string; onRoute: boolean } | null;
};

export type RecentlyDeleted = { stops: DeletedStop[]; items: DeletedItem[] };

// Everything below is for a Trip that has already been opened (lib/access.ts).

// The Trip's deleted Stops and Items that can still be restored, the latest
// deleted first.
export async function listRecentlyDeleted(trip: Trip): Promise<RecentlyDeleted> {
  const since = restorableSince();
  const [everyStop, deletedItems] = await Promise.all([
    db().select().from(stops).where(eq(stops.tripId, trip.id)).orderBy(desc(stops.deletedAt), desc(stops.id)),
    db()
      .select()
      .from(items)
      .where(and(eq(items.tripId, trip.id), gt(items.deletedAt, since)))
      .orderBy(desc(items.deletedAt), desc(items.id)),
  ]);
  const stopOf = new Map(everyStop.map((stop) => [stop.id, stop]));
  // Deleting a Stop marks its Items with the timestamp the Stop gets.
  const wentWithStop = (item: (typeof deletedItems)[number]) =>
    item.stopId !== null && stopOf.get(item.stopId)?.deletedAt?.getTime() === item.deletedAt!.getTime();

  return {
    stops: everyStop
      .filter((stop) => stop.deletedAt !== null && stop.deletedAt > since)
      .map((stop) => ({
        id: stop.id,
        name: stop.name,
        ...when(stop.deletedAt!),
        itemCount: deletedItems.filter((item) => item.stopId === stop.id && wentWithStop(item)).length,
      })),
    items: deletedItems
      .filter((item) => !wentWithStop(item))
      .map((item) => {
        const stop = item.stopId === null ? undefined : stopOf.get(item.stopId);
        return {
          id: item.id,
          title: item.title,
          category: item.category,
          ...when(item.deletedAt!),
          stop: stop ? { id: stop.id, name: stop.name, onRoute: stop.deletedAt === null } : null,
        };
      }),
  };
}

const idSchema = z.uuid();

// Puts a deleted Stop back in the Route, where it was, together with exactly
// the Items that were deleted with it: the ones carrying its timestamp.
// Undefined when the Trip has no such Stop in Recently deleted.
export async function restoreStop(trip: Trip, stopId: string): Promise<Stop | undefined> {
  if (!idSchema.safeParse(stopId).success) return undefined;
  return db().transaction(async (tx) => {
    const [deleted] = await tx
      .select({ deletedAt: stops.deletedAt })
      .from(stops)
      .where(and(eq(stops.id, stopId), eq(stops.tripId, trip.id), gt(stops.deletedAt, restorableSince())))
      .for("update");
    if (!deleted?.deletedAt) return undefined;
    const restored = { deletedAt: null, updatedAt: new Date() };
    const [stop] = await tx.update(stops).set(restored).where(eq(stops.id, stopId)).returning();
    await tx
      .update(items)
      .set(restored)
      .where(and(eq(items.stopId, stopId), eq(items.deletedAt, deleted.deletedAt)));
    return stopContents(stop);
  });
}

// Puts a deleted Item back where it was: on its Stop, or on the Trip as a
// whole when it was there or its Stop is not on the Route any more.
// Undefined when the Trip has no such Item in Recently deleted.
export async function restoreItem(trip: Trip, itemId: string): Promise<Item | undefined> {
  if (!idSchema.safeParse(itemId).success) return undefined;
  return db().transaction(async (tx) => {
    const [deleted] = await tx
      .select({ stopId: items.stopId })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tripId, trip.id), gt(items.deletedAt, restorableSince())))
      .for("update");
    if (!deleted) return undefined;
    const stopId = deleted.stopId && (await stopStaysOnRoute(tx, trip, deleted.stopId)) ? deleted.stopId : null;
    const [item] = await tx
      .update(items)
      .set({ stopId, deletedAt: null, updatedAt: new Date() })
      .where(eq(items.id, itemId))
      .returning();
    return itemContents(item);
  });
}

// For the scheduled job, across every Trip: removes for good the Stops and
// Items that were deleted 30 days ago or more.
export async function purgeDeleted(): Promise<{ stops: number; items: number }> {
  const since = restorableSince();
  return db().transaction(async (tx) => {
    // The Stops are held first, so one being restored at this moment is either
    // purged whole or left whole: its Items are not purged from under it.
    const purgeable = await tx
      .select({ id: stops.id })
      .from(stops)
      .where(lte(stops.deletedAt, since))
      .orderBy(asc(stops.id))
      .for("update");
    // Items first, so those that go with a purged Stop are counted.
    const purgedItems = await tx.delete(items).where(lte(items.deletedAt, since)).returning({ id: items.id });
    const purgedStops = await tx
      .delete(stops)
      .where(
        inArray(
          stops.id,
          purgeable.map(({ id }) => id),
        ),
      )
      .returning({ id: stops.id });
    return { stops: purgedStops.length, items: purgedItems.length };
  });
}
