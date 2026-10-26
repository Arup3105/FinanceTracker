import { describe, expect, it } from "vitest";

// Simulate the system variables Vercel sets on a deployment, before auth is first built.
process.env.VERCEL_PROJECT_PRODUCTION_URL = "finance-tracker-example.vercel.app";
process.env.VERCEL_URL = "finance-tracker-abc123-team.vercel.app";

const { getAuth } = await import("@/lib/auth");

describe("Better Auth trusted origins", () => {
  it("trusts BETTER_AUTH_URL and the Vercel deployment's own domains", async () => {
    const { trustedOrigins } = await getAuth().$context;
    expect(trustedOrigins).toEqual(
      expect.arrayContaining([
        "http://localhost:3000",
        "https://finance-tracker-example.vercel.app",
        "https://finance-tracker-abc123-team.vercel.app",
      ]),
    );
    expect(trustedOrigins).not.toContain("https://evil.example");
  });
});
