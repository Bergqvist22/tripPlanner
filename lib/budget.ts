import { CATEGORIES, type Category } from "./categories";
import { conversionTo, type Conversion } from "./exchange-rates";
import type { Item } from "./items";
import type { Stop } from "./stops";
import type { Trip } from "./trips";

// A cost for the whole group, and one traveller's share of it.
export type Amount = { total: number; perPerson: number };

// What the Trip costs: the sum of its Selected and Booked Items, each
// converted from its own currency to the display currency. Each breakdown adds
// up to the total. Suggestions are summed on their own and are not part of it.
export type Budget = Amount & {
  displayCurrency: string;
  travellerCount: number;
  // Whether the exchange rates used may be out of date, as no fresh ones could be fetched.
  ratesOutOfDate: boolean;
  // Currencies no exchange rate is known for. Items that need one of them
  // converted, to or from, are not counted.
  withoutRate: string[];
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

// The conversion of the Items' costs to the Trip's display currency.
export function conversionFor(trip: Trip, items: Item[]) {
  const priced = items.filter(({ cost }) => cost !== null);
  return conversionTo(
    trip.displayCurrency,
    priced.map(({ currency }) => currency),
  );
}

// What each Item priced in another currency costs in the display currency, by
// Item id. Items without a cost, or without a known exchange rate, have none.
export function displayCosts(items: Item[], conversion: Conversion): Record<string, number> {
  const costs: Record<string, number> = {};
  for (const { id, cost, currency } of items) {
    const converted = cost === null ? undefined : conversion.inDisplayCurrency(cost, currency);
    if (converted !== undefined && currency !== conversion.displayCurrency) costs[id] = converted;
  }
  return costs;
}

// For a Trip that has already been opened (lib/access.ts), from its Stops and
// its Items that have not been deleted.
export function budgetOf(trip: Trip, stops: Stop[], items: Item[], conversion: Conversion): Budget {
  const { travellerCount } = trip;
  // A share is rounded to the cent, so shares need not add up to the last cent.
  const amount = (cents: number): Amount => ({
    total: cents / 100,
    perPerson: Math.round(cents / travellerCount) / 100,
  });
  // An Item's cost is converted to the cent before it is multiplied, so it
  // counts for what it is shown to cost. Undefined without an exchange rate.
  const converted = ({ cost, currency }: Item) =>
    cost === null ? null : conversion.inDisplayCurrency(cost, currency);
  // A total Item counts once, a per-person Item once for every traveller.
  const sum = (summed: Item[]) =>
    amount(
      summed.reduce(
        (cents, item) =>
          cents + inCents(converted(item) ?? 0) * (item.costBasis === "per_person" ? travellerCount : 1),
        0,
      ),
    );

  const decided = items.filter(({ status }) => status === "selected" || status === "booked");
  const suggestions = items.filter(({ status }) => status === "suggestion");
  const unconverted = [...decided, ...suggestions].filter((item) => converted(item) === undefined);
  const onStops = new Set(stops.map((stop) => stop.id));

  return {
    ...sum(decided),
    displayCurrency: trip.displayCurrency,
    travellerCount,
    ratesOutOfDate: conversion.outOfDate,
    // Without a rate for the display currency itself nothing can be converted to it.
    withoutRate: [...new Set(unconverted.flatMap(({ currency }) => [trip.displayCurrency, currency]))]
      .filter((currency) => !conversion.hasRate(currency))
      .sort(),
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
    suggestions: sum(suggestions),
  };
}
