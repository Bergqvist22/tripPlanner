import Link from "next/link";
import { useId } from "react";
import { CATEGORY_NAMES } from "@/lib/categories";
import { dayByDay } from "@/lib/days";
import type { Item } from "@/lib/items";
import { STATUS_NAMES } from "@/lib/statuses";
import { formattedDay } from "./stop-dates";
import styles from "./day-by-day.module.css";

// What is said next to an Item's title. An Accommodation is listed on the day
// the group checks in.
function categoryAndStatus({ category, status }: Item) {
  const names = [CATEGORY_NAMES[category], STATUS_NAMES[status]];
  return (category === "accommodation" ? ["Check-in", ...names] : names).join(" · ");
}

// Items listed day by day: under each day the ones dated that day, those
// without a time first and the rest in time order, and last the Unscheduled
// ones, which have no date.
export function DayByDay({ tripId, items }: { tripId: string; items: Item[] }) {
  const id = useId();
  const { days, unscheduled } = dayByDay(items);
  // Under a day the times are in a column of their own, empty for an Item
  // without one.
  const listed = (item: Item, onDay: boolean) => (
    <li key={item.id} className={onDay ? styles.onDay : styles.listed} data-status={item.status}>
      {onDay && <span className={styles.time}>{item.time}</span>}
      <Link className={styles.title} href={`/trips/${tripId}/items/${item.id}`}>
        {item.title}
      </Link>
      <span className={styles.about}>
        {/* A time alone does not say which day. */}
        {!onDay && item.time && `At ${item.time} · `}
        {categoryAndStatus(item)}
      </span>
    </li>
  );

  return (
    <div className={styles.days}>
      {days.map((day) => (
        <section key={day.date} className={styles.day} aria-labelledby={`${id}-${day.date}`}>
          <h3 id={`${id}-${day.date}`}>{formattedDay(day.date)}</h3>
          <ol className={styles.list}>{day.items.map((item) => listed(item, true))}</ol>
        </section>
      ))}
      {unscheduled.length > 0 && (
        <section className={styles.day} aria-labelledby={`${id}-unscheduled`}>
          <h3 id={`${id}-unscheduled`}>Unscheduled</h3>
          <ul className={styles.list}>{unscheduled.map((item) => listed(item, false))}</ul>
        </section>
      )}
    </div>
  );
}
