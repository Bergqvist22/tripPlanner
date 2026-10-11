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

export function stopDates({ arrivalDate, departureDate }: Pick<Stop, "arrivalDate" | "departureDate">) {
  if (arrivalDate && departureDate) return `${formattedDate(arrivalDate)} – ${formattedDate(departureDate)}`;
  if (arrivalDate) return `Arrives ${formattedDate(arrivalDate)}`;
  if (departureDate) return `Leaves ${formattedDate(departureDate)}`;
  return "No dates yet";
}

export function stopNights(nights: number) {
  return `${nights} ${nights === 1 ? "night" : "nights"}`;
}
