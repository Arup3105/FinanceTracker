import { describe, expect, it } from "vitest";

// Point the app at a port where nothing listens, before the env is first read.
process.env.MONGODB_URI = "mongodb://127.0.0.1:1/?directConnection=true";

const { getDb, getMongoClient } = await import("@/server/db/client");

describe("MongoDB client cache", () => {
  it("replaces a client the driver closed after a failed first connection", async () => {
    const first = getMongoClient();
    await expect(getDb().command({ ping: 1 })).rejects.toThrow();

    // Without the reset, every later request reuses the closed client and throws MongoTopologyClosedError.
    const second = getMongoClient();
    expect(second).not.toBe(first);
    await expect(getDb().command({ ping: 1 })).rejects.not.toThrow(/Topology is closed/);
  });
});
