import type { travelMode } from "@/db/schema";

export type TravelMode = (typeof travelMode.enumValues)[number];

// Every travel mode of a Leg by the name travellers see, in the order they are listed.
export const TRAVEL_MODE_NAMES: Record<TravelMode, string> = {
  drive: "Drive",
  flight: "Flight",
  train: "Train",
  ferry: "Ferry",
  other: "Other",
};

export const TRAVEL_MODES = Object.keys(TRAVEL_MODE_NAMES) as TravelMode[];
