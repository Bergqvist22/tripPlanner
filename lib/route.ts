import type { Place } from "./place-search";
import type { Stop } from "./stops";

// A Stop on the map. Its number is its position on the Route, counting the
// Stops that have no pin.
export type Pin = Place & { stopId: string; name: string; number: number };

// The Route as the overview map draws it: a pin per Stop that has a place,
// joined in order by straight lines.
export type Route = { pins: Pin[]; stopsWithoutPlace: number };

// For the Trip's Stops in Route order.
export function routeOf(stops: Stop[]): Route {
  const pins = stops.flatMap(({ id, name, place }, index) =>
    place ? { stopId: id, name, number: index + 1, ...place } : [],
  );
  return { pins, stopsWithoutPlace: stops.length - pins.length };
}
