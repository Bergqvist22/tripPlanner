import { beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { trips } from "@/db/schema";
import { createTrip, emptyDatabase } from "./support";

beforeEach(emptyDatabase);

// The one place the suite looks at stored rows instead of going through the
// server API: how a Trip password is stored is a promise about the database
// itself, and no operation can (or should) reveal it.
test("a Trip password is stored only as a salted hash", async () => {
  await createTrip({ name: "First", password: "golden-gate" });
  await createTrip({ name: "Second", password: "golden-gate" });

  const stored = await db().select().from(trips);

  expect(JSON.stringify(stored)).not.toContain("golden-gate");
  const [first, second] = stored.map((trip) => trip.passwordHash);
  expect(first).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  // Same password, different salt, different hash.
  expect(first).not.toBe(second);
});

test("a Trip without a Trip password stores none", async () => {
  await createTrip({ password: undefined });

  const [stored] = await db().select().from(trips);

  expect(stored.passwordHash).toBeNull();
});
