import { config } from "dotenv";

/**
 * Integration tests run against a dedicated MongoDB Atlas test database.
 * Configure it in .env.test.local (never committed):
 *   MONGODB_URI_TEST=mongodb+srv://...
 *   MONGODB_DB_NAME_TEST=finance_test   (optional, must contain "test")
 */
config({ path: ".env.test.local", quiet: true });

const testUri = process.env.MONGODB_URI_TEST;
const testDbName = process.env.MONGODB_DB_NAME_TEST ?? "finance_test";

if (!/test/i.test(testDbName)) {
  throw new Error(`Refusing to run tests against database "${testDbName}": the name must contain "test".`);
}

// The app reads these variables; point them at the test database only.
process.env.MONGODB_URI = testUri ?? "mongodb://127.0.0.1:1/unconfigured";
process.env.MONGODB_DB_NAME = testDbName;
process.env.BETTER_AUTH_SECRET = "test-secret-for-automated-tests-only-0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

export const hasTestDatabase = Boolean(testUri);
