import { CATEGORY_NAMES } from "@/lib/categories";
import type { Amount, Budget as TripBudget } from "@/lib/budget";
import { formattedCost } from "@/lib/currency";
import styles from "./budget.module.css";

// What the Trip costs, as the server summed it. Parts that cost nothing are
// left out of a breakdown.
export function Budget({ budget }: { budget: TripBudget }) {
  const { displayCurrency, travellerCount, byStatus, suggestions, withoutRate } = budget;
  const cost = (amount: number) => formattedCost(amount, displayCurrency);
  const travellers = `${travellerCount} ${travellerCount === 1 ? "traveller" : "travellers"}`;

  const breakdowns: { heading: string; parts: (Amount & { name: string })[] }[] = [
    {
      heading: "By Status",
      parts: [
        { name: "Booked", ...byStatus.booked },
        { name: "Selected", ...byStatus.selected },
      ],
    },
    {
      heading: "By Category",
      parts: budget.byCategory.map(({ category, ...amount }) => ({ name: CATEGORY_NAMES[category], ...amount })),
    },
    {
      heading: "By Stop",
      parts: budget.byStop.map(({ name, ...amount }) => ({ name: name ?? "Whole Trip", ...amount })),
    },
  ];

  return (
    <div className={styles.budget}>
      <dl className={styles.totals}>
        <div>
          <dt>Total</dt>
          <dd className={styles.total}>{cost(budget.total)}</dd>
        </div>
        <div>
          <dt>Per person</dt>
          <dd>{cost(budget.perPerson)}</dd>
        </div>
      </dl>
      <p className={styles.note}>
        {budget.total === 0
          ? "Nothing with a cost is Selected or Booked yet."
          : `Selected and Booked Items, for ${travellers}.`}
      </p>
      {budget.ratesOutOfDate && (
        <p className={styles.warning} role="status">
          Exchange rates could not be updated, so costs converted to {displayCurrency} may be out of date.
        </p>
      )}
      {withoutRate.length > 0 && (
        <p className={styles.warning} role="status">
          No exchange rate is known for {withoutRate.join(", ")}, so Items that need{" "}
          {withoutRate.length === 1 ? "it" : "one of them"} converted are not counted.
        </p>
      )}
      {budget.total > 0 &&
        breakdowns.map(({ heading, parts }) => (
          <section key={heading} className={styles.breakdown} aria-label={heading}>
            <h3>{heading}</h3>
            <dl>
              {parts
                .filter((part) => part.total > 0)
                .map((part, index) => (
                  <Part key={index} {...part} cost={cost} />
                ))}
            </dl>
          </section>
        ))}
      {suggestions.total > 0 && (
        <section className={styles.suggestions} aria-label="Suggestions">
          <h3>Suggestions</h3>
          <dl>
            <Part name="Not in the Budget" {...suggestions} cost={cost} />
          </dl>
        </section>
      )}
    </div>
  );
}

// One line of a breakdown: what it is, what it costs the group and each traveller.
function Part({ name, total, perPerson, cost }: Amount & { name: string; cost: (amount: number) => string }) {
  return (
    <div>
      <dt>{name}</dt>
      <dd>
        {cost(total)}
        <small>{cost(perPerson)} per person</small>
      </dd>
    </div>
  );
}
