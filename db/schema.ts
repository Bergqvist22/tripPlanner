import { sql } from "drizzle-orm";
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Vocabulary follows CONTEXT.md.

export const category = pgEnum("category", [
  "flight",
  "car_rental",
  "accommodation",
  "activity",
  "food",
  "transport",
  "other",
]);

export const status = pgEnum("status", ["suggestion", "selected", "booked", "rejected"]);

export const costBasis = pgEnum("cost_basis", ["total", "per_person"]);

export const travelMode = pgEnum("travel_mode", ["drive", "flight", "train", "ferry", "other"]);

export const trips = pgTable(
  "trips",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    creatorName: text().notNull(),
    passwordHash: text().notNull(),
    travellerCount: integer().notNull(),
    displayCurrency: text().notNull(),
    // Rate limiting of unlock attempts: how many wrong Trip passwords have
    // been given since the current window opened.
    wrongPasswordCount: integer().notNull().default(0),
    wrongPasswordsSince: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("trips_traveller_count_at_least_1", sql`${t.travellerCount} >= 1`)],
);

export const stops = pgTable(
  "stops",
  {
    id: uuid().primaryKey().defaultRandom(),
    tripId: uuid()
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    name: text().notNull(),
    position: integer().notNull(),
    arrivalDate: date(),
    departureDate: date(),
    placeLabel: text(),
    placeLatitude: doublePrecision(),
    placeLongitude: doublePrecision(),
    notes: text().notNull().default(""),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("stops_trip_id_idx").on(t.tripId)],
);

export const items = pgTable(
  "items",
  {
    id: uuid().primaryKey().defaultRandom(),
    tripId: uuid()
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    // No Stop means the Item sits on the Trip as a whole.
    stopId: uuid().references(() => stops.id, { onDelete: "cascade" }),
    category: category().notNull(),
    title: text().notNull(),
    status: status().notNull().default("suggestion"),
    cost: numeric({ precision: 12, scale: 2 }),
    currency: text().notNull(),
    costBasis: costBasis().notNull().default("total"),
    // For Accommodation, date and endDate are check-in and check-out.
    date: date(),
    time: time(),
    endDate: date(),
    placeLabel: text(),
    placeLatitude: doublePrecision(),
    placeLongitude: doublePrecision(),
    link: text().notNull().default(""),
    bookingReference: text().notNull().default(""),
    notes: text().notNull().default(""),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("items_trip_id_idx").on(t.tripId),
    index("items_stop_id_idx").on(t.stopId),
    check(
      "items_accommodation_has_dates",
      sql`${t.category} <> 'accommodation' OR (${t.date} IS NOT NULL AND ${t.endDate} IS NOT NULL)`,
    ),
  ],
);

// A Leg is derived from the Stop order, never created by hand. This table
// holds what is known about a pair of Stops, so it survives reordering.
export const legs = pgTable(
  "legs",
  {
    fromStopId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: "cascade" }),
    toStopId: uuid()
      .notNull()
      .references(() => stops.id, { onDelete: "cascade" }),
    travelMode: travelMode().notNull().default("drive"),
    calculatedDurationSeconds: integer(),
    calculatedDistanceMeters: integer(),
    calculatedGeometry: jsonb(),
    manualDurationSeconds: integer(),
  },
  (t) => [primaryKey({ columns: [t.fromStopId, t.toStopId] })],
);
