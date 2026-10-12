import { CATEGORY_NAMES } from "@/lib/categories";
import { RESTORABLE_DAYS, type DeletedItem, type RecentlyDeleted as Listed } from "@/lib/recently-deleted";
import { RestoreButton } from "./restore-button";
import styles from "./recently-deleted.module.css";

function days(count: number) {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

// When it was deleted, and how long it can still be restored.
function When({ deletedAt, daysLeft }: { deletedAt: string; daysLeft: number }) {
  const daysAgo = RESTORABLE_DAYS - daysLeft;
  return (
    <p className={styles.when}>
      Deleted <time dateTime={deletedAt}>{daysAgo === 0 ? "less than a day ago" : `${days(daysAgo)} ago`}</time> ·{" "}
      {days(daysLeft)} left
    </p>
  );
}

// Where restoring the Item puts it.
function restoredTo({ stop }: DeletedItem) {
  if (!stop) return "For the whole Trip";
  return stop.onRoute ? `At ${stop.name}` : `Was at ${stop.name}, which is deleted: restored to the whole Trip`;
}

// The Trip's deleted Stops and Items, each with a button that restores it.
export function RecentlyDeleted({ tripId, deleted }: { tripId: string; deleted: Listed }) {
  return (
    <ul className={styles.deleted}>
      {deleted.stops.map((stop) => (
        <li key={stop.id}>
          <div className={styles.what}>
            <p className={styles.name}>{stop.name}</p>
            <p className={styles.detail}>
              Stop
              {stop.itemCount > 0 && ` · with its ${stop.itemCount === 1 ? "1 Item" : `${stop.itemCount} Items`}`}
            </p>
            <When {...stop} />
          </div>
          <RestoreButton endpoint={`/api/trips/${tripId}/stops/${stop.id}/restore`} name={stop.name} />
        </li>
      ))}
      {deleted.items.map((item) => (
        <li key={item.id}>
          <div className={styles.what}>
            <p className={styles.name}>{item.title}</p>
            <p className={styles.detail}>
              {CATEGORY_NAMES[item.category]} · {restoredTo(item)}
            </p>
            <When {...item} />
          </div>
          <RestoreButton endpoint={`/api/trips/${tripId}/items/${item.id}/restore`} name={item.title} />
        </li>
      ))}
    </ul>
  );
}
