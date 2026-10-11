import type { DrawnLeg } from "./legs";
import type { Place } from "./place-search";
import type { Stop } from "./stops";

// A Stop on the map. Its number is its position on the Route, counting the
// Stops that have no pin.
export type Pin = Place & { stopId: string; name: string; number: number };

// What joins one pin to the next: points of latitude and longitude. A Drive
// that has been calculated follows the road; anything else is a straight line.
export type Line = { points: [number, number][]; alongRoad: boolean };

// The Route as the overview map draws it: a pin per Stop that has a place,
// each joined to the next.
export type Route = { pins: Pin[]; lines: Line[]; stopsWithoutPlace: number };

// For the Trip's Stops in Route order, and the Legs between them.
export function routeOf(stops: Stop[], legs: DrawnLeg[]): Route {
  const pins = stops.flatMap(({ id, name, place }, index) =>
    place ? { stopId: id, name, number: index + 1, ...place } : [],
  );
  const lines = pins.slice(1).map((to, index): Line => {
    const from = pins[index];
    // Pins either side of a Stop without a place have no Leg of their own.
    const road = legs.find(({ leg }) => leg.fromStopId === from.stopId && leg.toStopId === to.stopId)?.road;
    if (road) return { points: road, alongRoad: true };
    return { points: [from, to].map(({ latitude, longitude }) => [latitude, longitude]), alongRoad: false };
  });
  return { pins, lines, stopsWithoutPlace: stops.length - pins.length };
}
