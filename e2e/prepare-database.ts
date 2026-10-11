import setup from "../test/global-setup";

// Run before the server under test starts: Postgres in Docker and a freshly
// migrated test database, the same as the API suite gets.
setup().catch((error) => {
  console.error(error);
  process.exit(1);
});
