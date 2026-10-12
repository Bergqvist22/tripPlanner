import type { Category } from "./categories";
import type { Item } from "./items";
import type { Place } from "./place-search";
import type { Status } from "./statuses";
import type { Stop } from "./stops";

// An Item on the map. Its Category gives the pin its colour, and its Status
// says whether the pin is dimmed (a Suggestion) or left out (Rejected, until
// Rejected Items are being shown).
export type ItemPin = Place & { itemId: string; title: string; category: Category; status: Status };

// A Stop as its close-up map draws it: a pin per Item of the Stop that has a
// place, in the order the Items were added.
export type CloseUp = { pins: ItemPin[] };

// For a Stop and the Items of its Trip.
export function closeUpOf(stop: Pick<Stop, "id">, items: Item[]): CloseUp {
  const pins = items.flatMap(({ id, stopId, title, category, status, place }) =>
    stopId === stop.id && place ? { itemId: id, title, category, status, ...place } : [],
  );
  return { pins };
}
