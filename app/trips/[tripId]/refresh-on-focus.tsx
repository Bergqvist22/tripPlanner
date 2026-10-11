"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Refetches the page when the traveller returns to the tab, so it shows what
// fellow travellers changed meanwhile. There is no live push.
export function RefreshOnFocus() {
  const router = useRouter();

  useEffect(() => {
    // Returning to the tab can be told twice, as focus and as becoming visible.
    let refreshedAt = 0;
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - refreshedAt < 100) return;
      refreshedAt = Date.now();
      router.refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
}
