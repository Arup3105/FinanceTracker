import "server-only";
import { MongoClient, type Db } from "mongodb";
import { getEnv } from "@/lib/env";

type MongoCache = { client?: MongoClient; db?: Db };

// Reuse a single client across hot reloads (dev) and warm serverless invocations (prod)
// so we never open a new connection pool per request.
const globalForMongo = globalThis as typeof globalThis & { __financeMongo?: MongoCache };
const cache: MongoCache = (globalForMongo.__financeMongo ??= {});

export function getMongoClient(): MongoClient {
  if (!cache.client) {
    const { MONGODB_URI } = getEnv();
    const client = new MongoClient(MONGODB_URI, {
      // Keep the pool small: Atlas free tier caps total connections per cluster.
      maxPoolSize: 10,
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 10_000,
      appName: "finance-tracker",
    });
    // A failed first connection (e.g. Atlas IP access list) closes the client for good and every
    // later call throws MongoTopologyClosedError. Drop it so the next request starts a fresh one.
    client.on("topologyClosed", () => {
      if (cache.client === client) {
        cache.client = undefined;
        cache.db = undefined;
      }
    });
    cache.client = client;
  }
  return cache.client;
}

export function getDb(): Db {
  if (!cache.db) {
    cache.db = getMongoClient().db(getEnv().MONGODB_DB_NAME);
  }
  return cache.db;
}
