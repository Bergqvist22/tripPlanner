import Link from "next/link";
import { useId } from "react";
import { CATEGORIES, CATEGORY_NAMES } from "@/lib/categories";
import type { Item } from "@/lib/items";
import { CopyButton } from "./copy-button";
import { formattedDate } from "./stop-dates";
import styles from "./item-list.module.css";

function itemCost({ cost, currency, costBasis }: Item) {
  if (cost === null) return undefined;
  const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency, currencyDisplay: "code" }).format(cost);
  return `${amount} ${costBasis === "total" ? "total" : "per person"}`;
}

function itemDates({ category, date, endDate }: Item) {
  if (category !== "accommodation" || !date || !endDate) return undefined;
  return `Check-in ${formattedDate(date)} · Check-out ${formattedDate(endDate)}`;
}

// The site a link leads to, which says more than the whole address.
function site(link: string) {
  return URL.canParse(link) ? new URL(link).hostname.replace(/^www\./, "") : link;
}

// Items grouped by Category. `empty` is what to say when there are none.
export function ItemList({ tripId, items, empty }: { tripId: string; items: Item[]; empty: string }) {
  const id = useId();
  if (items.length === 0) return <p className={styles.empty}>{empty}</p>;

  return (
    <div className={styles.groups}>
      {CATEGORIES.map((category) => {
        const group = items.filter((item) => item.category === category);
        if (group.length === 0) return null;
        return (
          <section key={category} className={styles.group} aria-labelledby={`${id}-${category}`}>
            <h3 id={`${id}-${category}`}>{CATEGORY_NAMES[category]}</h3>
            <ul className={styles.list}>
              {group.map((item) => {
                const facts = [itemCost(item), itemDates(item)].filter(Boolean);
                return (
                  <li key={item.id} className={styles.item}>
                    <Link className={styles.title} href={`/trips/${tripId}/items/${item.id}`}>
                      {item.title}
                    </Link>
                    {facts.length > 0 && <p className={styles.facts}>{facts.join(" · ")}</p>}
                    {item.link && (
                      <a
                        className={styles.link}
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Opens in a new tab"
                      >
                        {site(item.link)} ↗
                      </a>
                    )}
                    {item.bookingReference && (
                      <p className={styles.reference}>
                        <span>Booking reference</span>
                        <code>{item.bookingReference}</code>
                        <CopyButton text={item.bookingReference} />
                      </p>
                    )}
                    {item.notes && <p className={styles.notes}>{item.notes}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
