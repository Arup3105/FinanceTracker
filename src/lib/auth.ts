import "server-only";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { nextCookies } from "better-auth/next-js";
import { getEnv } from "@/lib/env";
import { getDb, getMongoClient } from "@/server/db/client";
import { deleteAllFinancialData } from "@/server/services/data-service";

/**
 * Origins Vercel assigns to this deployment (production domain, branch URL, deployment URL).
 * Vercel sets these system variables itself, so they only ever name this project's own domains.
 */
function vercelOrigins(): string[] {
  return [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`);
}

function createAuth() {
  const env = getEnv();
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && productionHost && new URL(env.BETTER_AUTH_URL).host !== productionHost) {
    console.warn(
      `[config] BETTER_AUTH_URL is ${new URL(env.BETTER_AUTH_URL).origin}, but this deployment is served at https://${productionHost}. Set BETTER_AUTH_URL to https://${productionHost}.`,
    );
  }
  return betterAuth({
    appName: "Finance Tracker",
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: vercelOrigins(),
    secret: env.BETTER_AUTH_SECRET,
    // Passing the client enables MongoDB transactions inside the adapter (Atlas clusters are replica sets).
    database: mongodbAdapter(getDb(), { client: getMongoClient() }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh expiry at most once a day
    },
    user: {
      deleteUser: {
        enabled: true,
        // Remove every financial record before the auth user disappears.
        beforeDelete: async (user) => {
          await deleteAllFinancialData(user.id);
        },
      },
    },
    rateLimit: {
      enabled: true,
      // In-memory counters do not survive across serverless instances, so keep them in MongoDB.
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 300, max: 5 },
        "/change-password": { window: 300, max: 5 },
        "/delete-user": { window: 300, max: 3 },
      },
    },
    advanced: {
      useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
      ipAddress: {
        // Vercel sets x-real-ip to the client address and does not let clients spoof it.
        ipAddressHeaders: ["x-real-ip"],
      },
    },
    plugins: [nextCookies()], // must stay last
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & {
  __financeAuth?: { auth: Auth; client: ReturnType<typeof getMongoClient> };
};

/**
 * Lazily constructed so missing env vars surface as a clear runtime error, not a build failure.
 * Rebuilt whenever the MongoDB client is replaced, so auth never keeps a closed client.
 */
export function getAuth(): Auth {
  const client = getMongoClient();
  if (globalForAuth.__financeAuth?.client !== client) {
    globalForAuth.__financeAuth = { auth: createAuth(), client };
  }
  return globalForAuth.__financeAuth.auth;
}

export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
