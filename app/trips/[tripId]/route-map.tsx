"use client";

import { useRouter } from "next/navigation";
import type { Route } from "@/lib/route";
import { aboutPin, useDrawnMap } from "./drawn-map";
import styles from "./route-map.module.css";

// How close the map goes in on its own: a town, not a street.
const CLOSEST_ZOOM = 11;

// The overview map of a Trip: a numbered pin per Stop that has a place, joined
// in Route order along the road where a Leg is driven and by a straight line
// where it is not. It is redrawn whenever the Route it is given has changed.
export function RouteMap({ tripId, route }: { tripId: string; route: Route }) {
  const router = useRouter();
  const container = useDrawnMap({ pins: route.pins, lines: route.lines }, CLOSEST_ZOOM, (L, layer, { pins, lines }) => {
    for (const line of lines) {
      const className = line.alongRoad ? styles.road : styles.straight;
      L.polyline(line.points, { className, interactive: false }).addTo(layer);
    }
    return pins.map((pin) => {
      const point = L.latLng(pin.latitude, pin.longitude);
      const title = `${pin.number}. ${pin.name}`;
      const link = { href: `/trips/${tripId}/stops/${pin.stopId}`, text: title };
      L.marker(point, {
        title,
        alt: title,
        icon: L.divIcon({ className: styles.pin, html: String(pin.number), iconSize: [30, 30] }),
      })
        .bindPopup(aboutPin(styles.about, link, [pin.label], (path) => router.push(path)))
        .addTo(layer);
      return point;
    });
  });

  const { pins, stopsWithoutPlace } = route;
  return (
    <div className={styles.overview}>
      {pins.length > 0 && <div ref={container} className={styles.map} role="group" aria-label="Map of the Route" />}
      {pins.length === 0 && (
        <p className={styles.note}>
          {stopsWithoutPlace === 0
            ? "The Route is drawn here once it has Stops with a place."
            : "No Stop has a place yet. Open a Stop and search for its place to put it on the map."}
        </p>
      )}
      {pins.length > 0 && stopsWithoutPlace > 0 && (
        <p className={styles.note}>
          {stopsWithoutPlace === 1
            ? "1 Stop has no place yet and is not on the map."
            : `${stopsWithoutPlace} Stops have no place yet and are not on the map.`}
        </p>
      )}
    </div>
  );
}
