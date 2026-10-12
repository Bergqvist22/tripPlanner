import type { Metadata } from "next";
import { OfflineReader } from "./offline-reader";

export const metadata: Metadata = { title: "Offline copy · Trip Planner" };

// The offline reader. The page itself holds nothing of any Trip, so a device
// can keep it and show it without a connection.
export default function OfflinePage() {
  return <OfflineReader />;
}
