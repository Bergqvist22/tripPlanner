import type { Stop } from "@/lib/stops";

const dayMonthYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formattedDate(date: string) {
  return dayMonthYear.format(new Date(date));
}

const weekdayDayMonthYear = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

// A date as the heading of its day: "Fri, 2 Jul 2027".
export function formattedDay(date: string) {
  return weekdayDayMonthYear.format(new Date(date));
}

// A day and when on it, as far as they are known.
function dayAndTime(date: string | null, time: string | null | undefined) {
  if (date) return time ? `${formattedDate(date)} at ${time}` : formattedDate(date);
  return time ? `at ${time}` : undefined;
}

// When the Stop is reached and left. An offline copy kept before Stops had
// times has none.
export function stopDates({
  arrivalDate,
  arrivalTime,
  departureDate,
  departureTime,
}: Pick<Stop, "arrivalDate" | "departureDate"> & Partial<Pick<Stop, "arrivalTime" | "departureTime">>) {
  const arrives = dayAndTime(arrivalDate, arrivalTime);
  const leaves = dayAndTime(departureDate, departureTime);
  if (arrivalDate && departureDate) return `${arrives} – ${leaves}`;
  if (arrives && leaves) return `Arrives ${arrives} · Leaves ${leaves}`;
  if (arrives) return `Arrives ${arrives}`;
  if (leaves) return `Leaves ${leaves}`;
  return "No dates yet";
}

export function stopNights(nights: number) {
  return `${nights} ${nights === 1 ? "night" : "nights"}`;
}
