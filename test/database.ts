// The test suite has its own database inside the Postgres from
// docker-compose.yml, so running tests never touches development data.
const SERVER = "postgres://tripplanner:tripplanner@localhost:54329";

export const ADMIN_DATABASE_URL = `${SERVER}/tripplanner`;
export const TEST_DATABASE = "tripplanner_test";
export const TEST_DATABASE_URL = `${SERVER}/${TEST_DATABASE}`;
