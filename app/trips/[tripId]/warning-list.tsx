import Link from "next/link";
import type { Warning } from "@/lib/warnings";
import { formattedDate, stopNights } from "./stop-dates";
import styles from "./warning-list.module.css";

const DAY_MS = 24 * 60 * 60 * 1000;

// Nights as travellers read them: one by its date, a run of them by its first
// and last.
function nightsNamed(nights: string[]) {
  const runs: string[][] = [];
  for (const night of nights) {
    const run = runs.at(-1);
    if (run && Date.parse(night) - Date.parse(run.at(-1)!) === DAY_MS) run.push(night);
    else runs.push([night]);
  }
  const named = runs.map((run) =>
    run.length === 1 ? formattedDate(run[0]) : `${formattedDate(run[0])} – ${formattedDate(run.at(-1)!)}`,
  );
  return `the ${nights.length === 1 ? "night" : "nights"} of ${named.join(", ")}`;
}

// What a warning says, and where to look at it: its Stop.
type Line = { text: string; href: string };

function lineAbout(tripId: string, warning: Exclude<Warning, { kind: "night-without-accommodation" }>): Line {
  const stopPage = (stopId: string) => `/trips/${tripId}/stops/${stopId}`;
  if (warning.kind === "accommodations-overlap") {
    const [first, second] = warning.accommodations;
    const stopId = first.stopId ?? second.stopId;
    return {
      text: `${first.title} and ${second.title} both cover ${nightsNamed(warning.nights)}.`,
      // Two Accommodations for the whole Trip have no Stop, so the first of
      // them is looked at instead.
      href: stopId ? stopPage(stopId) : `/trips/${tripId}/items/${first.itemId}`,
    };
  }
  const { accommodation, checkIn, checkOut, stopName, stopId } = warning;
  return {
    text: `${accommodation.title} (${formattedDate(checkIn)} – ${formattedDate(checkOut)}) is outside the dates of ${stopName}.`,
    href: stopPage(stopId),
  };
}

// The warnings about where the group sleeps. On the Trip page they are summed
// up, the nights without Accommodation as one line per Stop, and each leads to
// its Stop. On a Stop's own page every night is told.
export function WarningList({ tripId, warnings, summary }: { tripId: string; warnings: Warning[]; summary: boolean }) {
  const nights = warnings.filter((warning) => warning.kind === "night-without-accommodation");
  const stopPage = (stopId: string) => `/trips/${tripId}/stops/${stopId}`;
  const lines: Line[] = [];
  if (summary) {
    const byStop = Map.groupBy(nights, (warning) => warning.stopId);
    for (const [stopId, without] of byStop) {
      const count = stopNights(without.length);
      const named = nightsNamed(without.map(({ night }) => night));
      lines.push({ text: `${without[0].stopName} has ${count} without Accommodation: ${named}.`, href: stopPage(stopId) });
    }
  } else {
    for (const { night, stopId } of nights) {
      lines.push({ text: `No Accommodation for ${nightsNamed([night])}.`, href: stopPage(stopId) });
    }
  }
  for (const warning of warnings) {
    if (warning.kind !== "night-without-accommodation") lines.push(lineAbout(tripId, warning));
  }

  return (
    <ul className={styles.warnings}>
      {lines.map(({ text, href }, index) => (
        <li key={index}>{summary ? <Link href={href}>{text}</Link> : text}</li>
      ))}
    </ul>
  );
}
