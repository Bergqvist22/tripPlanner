"use client";

import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { MAP_TILES } from "@/lib/map-tiles";
import type { Route } from "@/lib/route";
import styles from "./route-map.module.css";

// How close the map goes in on its own: a town, not a street.
const CLOSEST_ZOOM = 11;

// The overview map of a Trip: a numbered pin per Stop that has a place, joined
// in Route order along the road where a Leg is driven and by a straight line
// where it is not. It is redrawn whenever the Route it is given has changed.
export function RouteMap({ tripId, route }: { tripId: string; route: Route }) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const shown = useRef<{ map: LeafletMap; drawn: LayerGroup }>(undefined);
  // A refetched page hands over the same Route as a new object. Comparing what
  // is in it leaves the map as the traveller moved it until the Route changes.
  const drawnAsText = JSON.stringify({ pins: route.pins, lines: route.lines });

  useEffect(() => {
    let left = false;
    // Leaflet needs a window, so it is loaded in the browser only.
    import("leaflet").then((L) => {
      if (left) return;
      // Without a pin there is no map on the page, and the next one drawn
      // starts over in a new place on it.
      if (shown.current && shown.current.map.getContainer() !== container.current) {
        shown.current.map.remove();
        shown.current = undefined;
      }
      if (!container.current) return;
      const { pins, lines }: Pick<Route, "pins" | "lines"> = JSON.parse(drawnAsText);

      if (!shown.current) {
        // The wheel scrolls the page, not the map; the buttons and a pinch zoom it.
        const map = L.map(container.current, { scrollWheelZoom: false });
        L.tileLayer(MAP_TILES.url, { attribution: MAP_TILES.attribution, maxZoom: MAP_TILES.maxZoom }).addTo(map);
        shown.current = { map, drawn: L.layerGroup().addTo(map) };
      }
      const { map, drawn } = shown.current;
      drawn.clearLayers();

      const points = pins.map((pin) => L.latLng(pin.latitude, pin.longitude));
      for (const line of lines) {
        const className = line.alongRoad ? styles.road : styles.straight;
        L.polyline(line.points, { className, interactive: false }).addTo(drawn);
      }
      pins.forEach((pin, index) => {
        const title = `${pin.number}. ${pin.name}`;
        const about = document.createElement("div");
        about.className = styles.about;
        const open = about.appendChild(document.createElement("a"));
        open.href = `/trips/${tripId}/stops/${pin.stopId}`;
        open.textContent = title;
        open.addEventListener("click", (event) => {
          event.preventDefault();
          router.push(open.pathname);
        });
        about.appendChild(document.createElement("span")).textContent = pin.label;

        L.marker(points[index], {
          title,
          alt: title,
          icon: L.divIcon({ className: styles.pin, html: String(pin.number), iconSize: [30, 30] }),
        })
          .bindPopup(about)
          .addTo(drawn);
      });

      if (points.length === 1) map.setView(points[0], CLOSEST_ZOOM);
      else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: CLOSEST_ZOOM });
    });
    return () => {
      left = true;
    };
  }, [drawnAsText, tripId, router]);

  useEffect(
    () => () => {
      shown.current?.map.remove();
      shown.current = undefined;
    },
    [],
  );

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
