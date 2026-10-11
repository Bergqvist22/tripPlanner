import { CATEGORIES, type Category } from "./categories";
import type { Item } from "./items";
import type { Stop } from "./stops";
import type { Trip } from "./trips";

// A cost for the whole group, and one traveller's share of it.
export type Amount = { total: number; perPerson: number };

// What the Trip costs: the sum of its Selected and Booked Items, with every
// cost read as if it were in the display currency. Each breakdown adds up to
// the total. Suggestions are summed on their own and are not part of it.
export type Budget = Amount & {
  displayCurrency: string;
  travellerCount: number;
  byStatus: { booked: Amount; selected: Amount };
  // Every Category, in the order they are listed.
  byCategory: (Amount & { category: Category })[];
  // Every Stop in Route order, then the Trip as a whole: no Stop, so no name.
  byStop: (Amount & { stopId: string | null; name: string | null })[];
  suggestions: Amount;
};

// Sums are kept in whole cents, so they do not drift the way fractions do.
function inCents(cost: number) {
  return Math.round(cost * 100);
}

// For a Trip that has already been opened (lib/access.ts), from its Stops and
// its Items that have not been deleted.
export function budgetOf(trip: Trip, stops: Stop[], items: Item[]): Budget {
  const { travellerCount } = trip;
  // A share is rounded to the cent, so shares need not add up to the last cent.
  const amount = (cents: number): Amount => ({
    total: cents / 100,
    perPerson: Math.round(cents / travellerCount) / 100,
  });
  // A total Item counts once, a per-person Item once for every traveller.
  const sum = (summed: Item[]) =>
    amount(
      summed.reduce(
        (cents, { cost, costBasis }) =>
          cents + (cost === null ? 0 : inCents(cost) * (costBasis === "per_person" ? travellerCount : 1)),
        0,
      ),
    );

  const decided = items.filter(({ status }) => status === "selected" || status === "booked");
  const onStops = new Set(stops.map((stop) => stop.id));

  return {
    ...sum(decided),
    displayCurrency: trip.displayCurrency,
    travellerCount,
    byStatus: {
      booked: sum(decided.filter(({ status }) => status === "booked")),
      selected: sum(decided.filter(({ status }) => status === "selected")),
    },
    byCategory: CATEGORIES.map((category) => ({
      category,
      ...sum(decided.filter((item) => item.category === category)),
    })),
    byStop: [
      ...stops.map(({ id, name }) => ({ stopId: id, name, ...sum(decided.filter((item) => item.stopId === id)) })),
      // An Item whose Stop was deleted a moment ago is counted here until it is gone too.
      { stopId: null, name: null, ...sum(decided.filter(({ stopId }) => stopId === null || !onStops.has(stopId))) },
    ],
    suggestions: sum(items.filter(({ status }) => status === "suggestion")),
  };
}
