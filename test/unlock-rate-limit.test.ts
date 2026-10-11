import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { browser, createdTripId, emptyDatabase } from "./support";

beforeEach(emptyDatabase);
beforeEach(() => {
  // Only the clock is faked, so waiting out a limit takes no real time.
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

const MINUTE = 60 * 1000;

async function guessWrong(stranger: ReturnType<typeof browser>, tripId: string, times: number) {
  for (let attempt = 0; attempt < times; attempt++) {
    expect((await stranger.unlock(tripId, `guess-${attempt}`)).status).toBe(403);
  }
}

test("after 5 wrong Trip passwords, further attempts on that Trip are refused for a while", async () => {
  const tripId = await createdTripId({ password: "golden-gate" });
  const stranger = browser();
  await guessWrong(stranger, tripId, 5);

  const response = await stranger.unlock(tripId, "guess-again");

  expect(response.status).toBe(429);
  expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  expect((await response.json()).error).toMatch(/too many/i);
});

test("while attempts are limited, even the right Trip password is refused, from any browser", async () => {
  const tripId = await createdTripId({ password: "golden-gate" });
  await guessWrong(browser(), tripId, 5);
  const emil = browser();

  expect((await emil.unlock(tripId, "golden-gate")).status).toBe(429);
  expect((await emil.readTrip(tripId)).status).toBe(401);
});

test("the limit is per Trip", async () => {
  const california = await createdTripId({ password: "golden-gate" });
  const oslo = await createdTripId({ password: "fjord" });
  const stranger = browser();
  await guessWrong(stranger, california, 5);

  expect((await stranger.unlock(oslo, "fjord")).status).toBe(200);
});

test("a browser that already unlocked the Trip keeps its access while attempts are limited", async () => {
  const tripId = await createdTripId({ password: "golden-gate" });
  const emil = browser();
  await emil.unlock(tripId, "golden-gate");
  await guessWrong(browser(), tripId, 5);

  expect((await emil.readTrip(tripId)).status).toBe(200);
});

test("attempts are allowed again 15 minutes after the first wrong one", async () => {
  const tripId = await createdTripId({ password: "golden-gate" });
  const emil = browser();
  await guessWrong(emil, tripId, 5);

  vi.advanceTimersByTime(14 * MINUTE);
  expect((await emil.unlock(tripId, "golden-gate")).status).toBe(429);

  vi.advanceTimersByTime(MINUTE);
  expect((await emil.unlock(tripId, "golden-gate")).status).toBe(200);
});

test("the right Trip password clears earlier wrong attempts", async () => {
  const tripId = await createdTripId({ password: "golden-gate" });
  const emil = browser();
  await guessWrong(emil, tripId, 4);
  expect((await emil.unlock(tripId, "golden-gate")).status).toBe(200);

  await guessWrong(emil, tripId, 4);
  expect((await emil.unlock(tripId, "golden-gate")).status).toBe(200);
});

test("wrong attempts spread out over time are never limited", async () => {
  const tripId = await createdTripId({ password: "golden-gate" });
  const emil = browser();

  for (let round = 0; round < 3; round++) {
    await guessWrong(emil, tripId, 4);
    vi.advanceTimersByTime(15 * MINUTE);
  }

  expect((await emil.unlock(tripId, "golden-gate")).status).toBe(200);
});
