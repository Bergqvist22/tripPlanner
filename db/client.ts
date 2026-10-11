import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function connect() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  return { pool, orm: drizzle(pool, { schema, casing: "snake_case" }) };
}

let connection: ReturnType<typeof connect> | undefined;

// Connects on first use, so importing this module never needs a database.
export function db() {
  connection ??= connect();
  return connection.orm;
}

export async function closeDb() {
  await connection?.pool.end();
  connection = undefined;
}
