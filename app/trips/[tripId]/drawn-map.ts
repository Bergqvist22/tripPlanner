"use client";

import "leaflet/dist/leaflet.css";
import type { LatLng, LayerGroup, Map as LeafletMap } from "leaflet";
import { useEffect, useEffectEvent, useRef } from "react";
import { MAP_TILES } from "@/lib/map-tiles";

type Leaflet = typeof import("leaflet");

// A Leaflet map in the element given the ref this returns, with `draw` putting
// what is to be shown on a layer of it and answering with the points the map
// should have in view. It is redrawn whenever what it is given has changed,
// which is told by its JSON, so that is all `draw` is handed of it. The map
// goes no closer on its own than `closestZoom`.
export function useDrawnMap<Drawn>(
  drawn: Drawn,
  closestZoom: number,
  draw: (L: Leaflet, layer: LayerGroup, drawn: Drawn) => LatLng[],
) {
  const container = useRef<HTMLDivElement>(null);
  const shown = useRef<{ map: LeafletMap; layer: LayerGroup }>(undefined);
  // A refetched page hands over the same things as a new object. Comparing
  // what is in it leaves the map as the traveller moved it until they change.
  const drawnAsText = JSON.stringify(drawn);
  const drawNow = useEffectEvent(draw);

  useEffect(() => {
    let left = false;
    // Leaflet needs a window, so it is loaded in the browser only.
    import("leaflet").then((L) => {
      if (left) return;
      // With nothing to draw there is no map on the page, and the next one
      // drawn starts over in a new place on it.
      if (shown.current && shown.current.map.getContainer() !== container.current) {
        shown.current.map.remove();
        shown.current = undefined;
      }
      if (!container.current) return;

      if (!shown.current) {
        // The wheel scrolls the page, not the map; the buttons and a pinch zoom it.
        const map = L.map(container.current, { scrollWheelZoom: false });
        L.tileLayer(MAP_TILES.url, { attribution: MAP_TILES.attribution, maxZoom: MAP_TILES.maxZoom }).addTo(map);
        shown.current = { map, layer: L.layerGroup().addTo(map) };
      }
      const { map, layer } = shown.current;
      layer.clearLayers();

      const points = drawNow(L, layer, JSON.parse(drawnAsText));
      if (points.length === 1) map.setView(points[0], closestZoom);
      else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: closestZoom });
    });
    return () => {
      left = true;
    };
  }, [drawnAsText, closestZoom]);

  useEffect(
    () => () => {
      shown.current?.map.remove();
      shown.current = undefined;
    },
    [],
  );

  return container;
}

// What a pin says when it is opened: a link to what it stands for, opened
// without loading the page anew, and a line of text for each thing about it.
export function aboutPin(className: string, link: { href: string; text: string }, lines: string[], open: (path: string) => void) {
  const about = document.createElement("div");
  about.className = className;
  const anchor = about.appendChild(document.createElement("a"));
  anchor.href = link.href;
  anchor.textContent = link.text;
  anchor.addEventListener("click", (event) => {
    event.preventDefault();
    open(anchor.pathname);
  });
  for (const line of lines) about.appendChild(document.createElement("span")).textContent = line;
  return about;
}
