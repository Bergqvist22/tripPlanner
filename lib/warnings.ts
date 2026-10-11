import type { Item } from "./items";
import type { Stop } from "./stops";

// An Accommodation as a warning names it. No Stop means it sits on the Trip
// as a whole.
export type WarnedAccommodation = { itemId: string; title: string; stopId: string | null };

// Something about where the group sleeps that it will want to look at. Nights
// are named by the date they begin on (YYYY-MM-DD).
export type Warning =
  // A night of a Stop that no Selected or Booked Accommodation covers.
  | { kind: "night-without-accommodation"; stopId: string; stopName: string; night: string }
  // Two Selected or Booked Accommodations that cover the same nights.
  | { kind: "accommodations-overlap"; accommodations: [WarnedAccommodation, WarnedAccommodation]; nights: string[] }
  // A Selected or Booked Accommodation that begins before its Stop is
  // arrived at, or ends after it is left.
  | {
      kind: "accommodation-outside-stop";
      stopId: string;
      stopName: string;
      accommodation: WarnedAccommodation;
      checkIn: string;
      checkOut: string;
    };

const DAY_MS = 24 * 60 * 60 * 1000;
const MOST_NIGHTS = 366;

// The nights from one date up to another: the night that begins on the last
// date is not one of them, as that is the day of leaving.
function nightsBetween(from: string, to: string) {
  const nights: string[] = [];
  // A stretch of more than a year is a mistyped date, and is not gone through
  // night by night to its end.
  const end = Math.min(Date.parse(to), Date.parse(from) + MOST_NIGHTS * DAY_MS);
  for (let day = Date.parse(from); day < end; day += DAY_MS) {
    nights.push(new Date(day).toISOString().slice(0, 10));
  }
  return nights;
}

// An Accommodation the group has decided on: Selected or Booked.
type Decided = WarnedAccommodation & { checkIn: string; checkOut: string };

// The warnings of a Trip, from its Stops in Route order and its Items that
// have not been deleted. They are worked out anew each time and never stored.
// Only what the group has decided on counts: a Suggestion or a Rejected Item
// neither covers a night nor causes a warning.
export function warningsOf(stops: Stop[], items: Item[]): Warning[] {
  const decided = items.flatMap(({ id, title, stopId, category, status, date, endDate }): Decided | [] =>
    category === "accommodation" && (status === "selected" || status === "booked") && date && endDate
      ? { itemId: id, title, stopId, checkIn: date, checkOut: endDate }
      : [],
  );
  const named = ({ itemId, title, stopId }: Decided): WarnedAccommodation => ({ itemId, title, stopId });

  // A night of a Stop is covered by an Accommodation on that Stop, or by one
  // on the Trip as a whole. A Stop with no dates or no nights has none to cover.
  const uncovered = stops.flatMap((stop): Warning[] => {
    if (!stop.arrivalDate || !stop.departureDate) return [];
    const covered = new Set(
      decided
        .filter(({ stopId }) => stopId === stop.id || stopId === null)
        .flatMap(({ checkIn, checkOut }) => nightsBetween(checkIn, checkOut)),
    );
    return nightsBetween(stop.arrivalDate, stop.departureDate)
      .filter((night) => !covered.has(night))
      .map((night) => ({ kind: "night-without-accommodation", stopId: stop.id, stopName: stop.name, night }));
  });

  // Wherever the two are: nobody sleeps in two places.
  const overlapping = decided.flatMap((first, index) =>
    decided.slice(index + 1).flatMap((second): Warning[] => {
      const from = first.checkIn > second.checkIn ? first.checkIn : second.checkIn;
      const to = first.checkOut < second.checkOut ? first.checkOut : second.checkOut;
      const nights = nightsBetween(from, to);
      if (nights.length === 0) return [];
      return [{ kind: "accommodations-overlap", accommodations: [named(first), named(second)], nights }];
    }),
  );

  // Against the dates the Stop has: one without dates cannot be fallen outside of.
  const outside = decided.flatMap((accommodation): Warning[] => {
    const stop = stops.find(({ id }) => id === accommodation.stopId);
    if (!stop) return [];
    const { checkIn, checkOut } = accommodation;
    const early = stop.arrivalDate !== null && checkIn < stop.arrivalDate;
    const late = stop.departureDate !== null && checkOut > stop.departureDate;
    if (!early && !late) return [];
    return [
      {
        kind: "accommodation-outside-stop",
        stopId: stop.id,
        stopName: stop.name,
        accommodation: named(accommodation),
        checkIn,
        checkOut,
      },
    ];
  });

  return [...uncovered, ...overlapping, ...outside];
}

// Whether the warning is about this Stop: a night of it, or an Accommodation on it.
export function isAbout(warning: Warning, stopId: string) {
  if (warning.kind === "accommodations-overlap") return warning.accommodations.some((accommodation) => accommodation.stopId === stopId);
  return warning.stopId === stopId;
}
