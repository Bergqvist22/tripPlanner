import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const KEY_LENGTH = 64;

export const PASSWORD_MAX_LENGTH = 200;

// Returns "scrypt$<salt>$<key>", both hex. The salt is new for every call, so
// the same Trip password never produces the same hash twice.
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = (await derive(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, hash: string) {
  // No Trip password is longer, so nothing longer is worth hashing.
  if (password.length > PASSWORD_MAX_LENGTH) return false;
  const [, salt, key] = hash.split("$");
  const expected = Buffer.from(key, "hex");
  const actual = (await derive(password, Buffer.from(salt, "hex"), expected.length)) as Buffer;
  return timingSafeEqual(actual, expected);
}
