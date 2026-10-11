import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const KEY_LENGTH = 64;

// Returns "scrypt$<salt>$<key>", both hex. The salt is new for every call, so
// the same Trip password never produces the same hash twice.
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = (await derive(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}
