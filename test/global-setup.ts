import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { closeDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import { ADMIN_DATABASE_URL, TEST_DATABASE, TEST_DATABASE_URL } from "./database";

// Starts Postgres in Docker and gives the run a freshly migrated database.
export default async function setup() {
  execFileSync("docker", ["compose", "up", "--detach", "--wait", "postgres"], { stdio: "inherit" });

  const admin = new Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
  await admin.end();

  process.env.DATABASE_URL = TEST_DATABASE_URL;
  await migrateDb();
  await closeDb();
}
