"use client";

import { useEffect, useState } from "react";
import styles from "./item-list.module.css";

// Copies a booking reference with one tap.
export function CopyButton({ text }: { text: string }) {
  const [outcome, setOutcome] = useState<"copied" | "failed">();

  useEffect(() => {
    if (!outcome) return;
    const shown = setTimeout(() => setOutcome(undefined), 2000);
    return () => clearTimeout(shown);
  }, [outcome]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setOutcome("copied");
    } catch {
      setOutcome("failed");
    }
  }

  return (
    <button className={styles.copy} type="button" onClick={copy} aria-label={`Copy booking reference ${text}`}>
      <span aria-live="polite">
        {outcome === "copied" ? "Copied" : outcome === "failed" ? "Could not copy" : "Copy"}
      </span>
    </button>
  );
}
