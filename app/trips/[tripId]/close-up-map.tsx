"use client";

import { useRouter } from "next/navigation";
import { CATEGORIES, CATEGORY_NAMES } from "@/lib/categories";
import type { CloseUp, ItemPin } from "@/lib/close-up";
import { STATUS_NAMES } from "@/lib/statuses";
import { aboutPin, useDrawnMap } from "./drawn-map";
import styles from "./close-up-map.module.css";
import mapStyles from "./route-map.module.css";

// How close the map goes in on its own: a few streets, not one doorstep.
const CLOSEST_ZOOM = 15;

// How strongly a pin is drawn. What is not decided on is dimmed.
const DIMMED = 0.5;

function decided({ status }: ItemPin) {
  return status === "selected" || status === "booked";
}

// The close-up map of a Stop: a pin per Item of the Stop that has a place,
// coloured by Category. Suggestions are dimmed next to what is Selected or
// Booked, and Rejected Items are on the map only while they are being shown.
export function CloseUpMap({
  tripId,
  closeUp,
  showingRejected,
}: {
  tripId: string;
  closeUp: CloseUp;
  showingRejected: boolean;
}) {
  const router = useRouter();
  const pins = showingRejected ? closeUp.pins : closeUp.pins.filter((pin) => pin.status !== "rejected");
  const container = useDrawnMap(pins, CLOSEST_ZOOM, (L, layer, pins) =>
    pins.map((pin) => {
      const point = L.latLng(pin.latitude, pin.longitude);
      const about = `${CATEGORY_NAMES[pin.category]} · ${STATUS_NAMES[pin.status]}`;
      const title = `${pin.title} · ${about}`;
      const link = { href: `/trips/${tripId}/items/${pin.itemId}`, text: pin.title };
      L.marker(point, {
        title,
        alt: title,
        opacity: decided(pin) ? 1 : DIMMED,
        // What is decided on is never hidden under a Suggestion next door.
        zIndexOffset: decided(pin) ? 1000 : 0,
        icon: L.divIcon({
          className: `${styles.pin} ${styles[pin.category]} ${pin.status === "rejected" ? styles.rejected : ""}`,
          iconSize: [24, 24],
        }),
      })
        .bindPopup(aboutPin(mapStyles.about, link, [about, pin.label], (path) => router.push(path)))
        .addTo(layer);
      return point;
    }),
  );

  const categories = CATEGORIES.filter((category) => pins.some((pin) => pin.category === category));
  return (
    <div className={mapStyles.overview}>
      {pins.length > 0 && (
        <>
          <div ref={container} className={mapStyles.map} role="group" aria-label="Map of the Items" />
          <ul className={styles.legend} aria-label="Pin colours">
            {categories.map((category) => (
              <li key={category}>
                <span className={`${styles.swatch} ${styles[category]}`} aria-hidden />
                {CATEGORY_NAMES[category]}
              </li>
            ))}
            {pins.some((pin) => pin.status === "suggestion") && <li className={styles.dimmed}>Dimmed: Suggestion</li>}
            {pins.some((pin) => pin.status === "rejected") && <li className={styles.dimmed}>Outlined: Rejected</li>}
          </ul>
        </>
      )}
      {pins.length === 0 && (
        <p className={mapStyles.note}>
          {closeUp.pins.length === 0
            ? "Items are shown here once they have a place. Open an Item and search for its place to put it on the map."
            : "Every Item with a place is Rejected."}
        </p>
      )}
    </div>
  );
}
