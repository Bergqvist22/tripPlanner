import type { status } from "@/db/schema";

export type Status = (typeof status.enumValues)[number];

// Every Status by the name travellers see, in the order a decision moves.
export const STATUS_NAMES: Record<Status, string> = {
  suggestion: "Suggestion",
  selected: "Selected",
  booked: "Booked",
  rejected: "Rejected",
};

export const STATUSES = Object.keys(STATUS_NAMES) as Status[];
