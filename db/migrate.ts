import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, db } from "./client";

export async function migrateDb() {
  await migrate(db(), { migrationsFolder: "./db/migrations" });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  migrateDb()
    .then(closeDb)
    .then(() => console.log("Database is up to date"))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
