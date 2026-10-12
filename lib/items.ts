import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { category, costBasis, items, status } from "@/db/schema";
import { z } from "zod";
import type { Category } from "./categories";
import { isCurrency } from "./currency";
import { optionalPlace, type Place } from "./place-search";
import type { Status } from "./statuses";
import { placeColumns, placeIn, stopStaysOnRoute } from "./stops";
import { fieldErrors, optionalDate, requiredText, type FieldErrors, type Trip } from "./trips";

// The cost column holds 10 digits before the decimal point and 2 after.
const COST_MAX = 9_999_999_999.99;

function hasAtMostTwoDecimals(cost: number) {
  return Math.abs(cost * 100 - Math.round(cost * 100)) < 1e-6;
}

// A link is only ever a web address, so opening it can do nothing else.
// One typed without https:// gets it. Undefined when it is not a web address.
function webAddress(typed: string) {
  if (typed === "") return "";
  if (/^(mailto|tel|javascript|data):/i.test(typed)) return undefined;
  const address = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`;
  return /^https?:\/\//i.test(address) && URL.canParse(address) ? address : undefined;
}

const link = z
  .string({ error: "The link must be text" })
  .trim()
  .max(2000, "The link can be at most 2,000 characters")
  .transform((typed, context) => {
    const address = webAddress(typed);
    if (address !== undefined) return address;
    context.issues.push({ code: "custom", message: "Enter a web address, like https://example.com", input: typed });
    return z.NEVER;
  });

// A time of day as a clock shows it, from 00:00 to 23:59.
const optionalTime = z
  .string({ error: "Enter a valid time" })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time, like 14:30")
  .nullable();

const itemDetailsSchema = z.object({
  // No Stop means the Item sits on the Trip as a whole.
  stopId: z.uuid("Choose a Stop on the Route, or the whole Trip").toLowerCase().nullable(),
  category: z.enum(category.enumValues, "Choose a Category"),
  title: requiredText("Give the Item a title"),
  cost: z
    .number({ error: "Enter the cost as a number" })
    .min(0, "The cost cannot be negative")
    .max(COST_MAX, "The cost is too large")
    .refine(hasAtMostTwoDecimals, "The cost can have at most 2 decimals")
    .nullable(),
  currency: z
    .string({ error: "Choose a currency" })
    .trim()
    .toUpperCase()
    .refine(isCurrency, "Choose a valid currency"),
  costBasis: z.enum(costBasis.enumValues, "Choose whether the cost is total or per person"),
  // The day the Item is listed under, and when on that day. For Accommodation
  // the date and the end date are check-in and check-out.
  date: optionalDate("Enter a valid date"),
  time: optionalTime,
  endDate: optionalDate("Enter a valid end date"),
  place: optionalPlace,
  link,
  bookingReference: z
    .string({ error: "The booking reference must be text" })
    .trim()
    .max(100, "The booking reference can be at most 100 characters"),
  notes: z.string({ error: "Notes must be text" }).max(10_000, "Notes can be at most 10,000 characters"),
});

// A new Item is a Suggestion, so it has no Status to give.
const newItemSchema = itemDetailsSchema.partial().required({ category: true, title: true });

// Only the fields that are sent are changed. Sending a Stop, or none, moves
// the Item. Its Status is changed the same way, and is its own: nothing
// happens to any other Item.
const itemChangesSchema = itemDetailsSchema
  .extend({ status: z.enum(status.enumValues, "Choose a Status") })
  .partial();

export type NewItem = z.infer<typeof newItemSchema>;
export type ItemChanges = z.infer<typeof itemChangesSchema>;

type Dated = { category: Category; date?: string | null; endDate?: string | null };

// Accommodation is the one Category that needs dates: the nights it covers.
function dateErrors({ category, date, endDate }: Dated): FieldErrors | undefined {
  const errors: FieldErrors = {};
  if (category === "accommodation") {
    if (!date) errors.date = "An Accommodation needs a check-in date";
    if (!endDate) errors.endDate = "An Accommodation needs a check-out date";
  }
  if (date && endDate && endDate < date) {
    errors.endDate =
      category === "accommodation" ? "Check-out cannot be before check-in" : "The end date cannot be before the date";
  }
  return Object.keys(errors).length > 0 ? errors : undefined;
}

const NOT_ON_ROUTE: FieldErrors = { stopId: "That Stop is not on the Route. Choose another Stop, or the whole Trip." };

export function parseNewItem(input: unknown): { item: NewItem } | { errors: FieldErrors } {
  const result = newItemSchema.safeParse(input);
  if (!result.success) return { errors: fieldErrors(result.error) };
  const errors = dateErrors(result.data);
  return errors ? { errors } : { item: result.data };
}

// Whether the changes fit what the Item already has is checked when they are
// made (updateItem).
export function parseItemChanges(input: unknown): { changes: ItemChanges } | { errors: FieldErrors } {
  const result = itemChangesSchema.safeParse(input);
  return result.success ? { changes: result.data } : { errors: fieldErrors(result.error) };
}

// An Item as travellers see it. Dates are calendar dates (YYYY-MM-DD) and the
// time is one of day (HH:MM), in no time zone: what the clock shows there.
export type Item = {
  id: string;
  stopId: string | null;
  category: Category;
  title: string;
  status: Status;
  cost: number | null;
  currency: string;
  costBasis: "total" | "per_person";
  date: string | null;
  time: string | null;
  endDate: string | null;
  // An Item without a place is left off the close-up map of its Stop.
  place: Place | null;
  link: string;
  bookingReference: string;
  notes: string;
};

export function itemContents(stored: typeof items.$inferSelect): Item {
  const { id, stopId, category, title, status, currency, costBasis, date, endDate, link, bookingReference, notes } =
    stored;
  const cost = stored.cost === null ? null : Number(stored.cost);
  const place = placeIn(stored);
  // Stored to the second, which nobody plans by.
  const time = stored.time === null ? null : stored.time.slice(0, 5);
  return {
    id,
    stopId,
    category,
    title,
    status,
    cost,
    currency,
    costBasis,
    date,
    time,
    endDate,
    place,
    link,
    bookingReference,
    notes,
  };
}

// The cost is stored as an exact decimal, and the place in columns of its own.
function asStored<Fields extends { cost?: number | null; place?: Place | null }>({ cost, place, ...fields }: Fields) {
  return {
    ...fields,
    ...placeColumns(place),
    ...(cost === undefined ? {} : { cost: cost === null ? null : cost.toFixed(2) }),
  };
}

const itemIdSchema = z.uuid();

// The Trip's Items that have not been deleted.
function onTrip(trip: Trip) {
  return and(eq(items.tripId, trip.id), isNull(items.deletedAt));
}

function isItemOf(trip: Trip, itemId: string) {
  return and(eq(items.id, itemId), onTrip(trip));
}

// Everything below is for a Trip that has already been opened (lib/access.ts).

// Until told otherwise an Item is priced in the Trip's display currency.
export async function addItem(trip: Trip, item: NewItem): Promise<{ item: Item } | { errors: FieldErrors }> {
  return db().transaction(async (tx) => {
    if (item.stopId && !(await stopStaysOnRoute(tx, trip, item.stopId))) return { errors: NOT_ON_ROUTE };
    const [added] = await tx
      .insert(items)
      .values({ currency: trip.displayCurrency, ...asStored(item), tripId: trip.id })
      .returning();
    return { item: itemContents(added) };
  });
}

// Every Item of the Trip, under a Stop or not, in the order they were added.
export async function listItems(trip: Trip): Promise<Item[]> {
  const listed = await db().select().from(items).where(onTrip(trip)).orderBy(asc(items.createdAt), asc(items.id));
  return listed.map(itemContents);
}

export async function findItem(trip: Trip, itemId: string): Promise<Item | undefined> {
  if (!itemIdSchema.safeParse(itemId).success) return undefined;
  const [found] = await db().select().from(items).where(isItemOf(trip, itemId));
  return found && itemContents(found);
}

// Undefined when the Trip has no such Item.
export async function updateItem(
  trip: Trip,
  itemId: string,
  changes: ItemChanges,
): Promise<{ item: Item } | { errors: FieldErrors } | undefined> {
  if (!itemIdSchema.safeParse(itemId).success) return undefined;
  return db().transaction(async (tx) => {
    // Locked, so the Category and dates cannot change between the check and the write.
    const [stored] = await tx.select().from(items).where(isItemOf(trip, itemId)).for("update");
    if (!stored) return undefined;
    const errors = dateErrors({ ...stored, ...changes });
    if (errors) return { errors };
    const moves = changes.stopId !== undefined && changes.stopId !== stored.stopId;
    if (moves && changes.stopId && !(await stopStaysOnRoute(tx, trip, changes.stopId))) return { errors: NOT_ON_ROUTE };
    if (Object.keys(changes).length === 0) return { item: itemContents(stored) };
    const [updated] = await tx
      .update(items)
      .set({ ...asStored(changes), updatedAt: new Date() })
      .where(eq(items.id, itemId))
      .returning();
    return { item: itemContents(updated) };
  });
}

// The Item is marked as deleted rather than removed, so it can be restored
// from Recently deleted. False when the Trip has no such Item.
export async function deleteItem(trip: Trip, itemId: string): Promise<boolean> {
  if (!itemIdSchema.safeParse(itemId).success) return false;
  const now = new Date();
  const deleted = await db()
    .update(items)
    .set({ deletedAt: now, updatedAt: now })
    .where(isItemOf(trip, itemId))
    .returning({ id: items.id });
  return deleted.length > 0;
}
