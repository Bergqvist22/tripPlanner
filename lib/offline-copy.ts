import { budgetOf, conversionFor, displayCosts, type Budget } from "./budget";
import { listItems, type Item } from "./items";
import { legsOf, travelOf, type Leg } from "./legs";
import { listStops, type Stop } from "./stops";
import type { Trip } from "./trips";

// What a device keeps of a Trip to read where there is no connection: the
// Trip, its Stops in Route order and its Items as they are, and what only the
// server works out about them. Nothing of the maps: they are not drawn offline.
export type OfflineCopy = {
  trip: Trip;
  stops: Stop[];
  items: Item[];
  // The Legs between the Stops, in Route order.
  legs: Leg[];
  budget: Budget;
  // What the Items priced in another currency cost in the display currency,
  // by Item id.
  displayCosts: Record<string, number>;
};

// For a Trip that has already been opened (lib/access.ts).
export async function offlineCopyOf(trip: Trip): Promise<OfflineCopy> {
  const [stops, items] = await Promise.all([listStops(trip), listItems(trip)]);
  const [conversion, legs] = await Promise.all([conversionFor(trip, items), legsOf(stops)]);
  return {
    trip,
    stops,
    items,
    legs: travelOf(legs).legs,
    budget: budgetOf(trip, stops, items, conversion),
    displayCosts: displayCosts(items, conversion),
  };
}
