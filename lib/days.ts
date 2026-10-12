import type { Item } from "./items";

// A day that has Items, with what is on it.
export type Day = { date: string; items: Item[] };

// Items as they are listed day by day: each one that has a date under its day,
// and the rest Unscheduled. An Accommodation is on its check-in day.
export type DayByDay = { days: Day[]; unscheduled: Item[] };

// For Items in the order they were added, which is the order they keep where
// nothing else tells them apart. Within a day those without a time come first,
// then the rest in time order.
export function dayByDay(items: Item[]): DayByDay {
  const dates = [...new Set(items.flatMap(({ date }) => date ?? []))].sort();
  const days = dates.map((date) => ({
    date,
    items: items.filter((item) => item.date === date).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
  }));
  return { days, unscheduled: items.filter((item) => item.date === null) };
}
