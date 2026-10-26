import "server-only";
import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z
    .string({ error: "MONGODB_URI is required (your MongoDB Atlas connection string)." })
    .regex(/^mongodb(\+srv)?:\/\//, "MONGODB_URI must start with mongodb:// or mongodb+srv://"),
  MONGODB_DB_NAME: z
    .string({ error: "MONGODB_DB_NAME is required (for example: finance)." })
    .min(1, "MONGODB_DB_NAME must not be empty."),
  BETTER_AUTH_SECRET: z
    .string({ error: "BETTER_AUTH_SECRET is required. Generate one with: npx @better-auth/cli secret" })
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters long."),
  BETTER_AUTH_URL: z
    .url({ error: "BETTER_AUTH_URL must be the full public URL of the app, e.g. http://localhost:3000" }),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validates and returns server-side environment variables. Throws a readable
 * configuration error listing every missing or invalid variable.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse({
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  });
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(
      `Invalid environment configuration. Copy .env.example to .env.local and fill in:\n${lines.join("\n")}`,
    );
  }
  cached = parsed.data;
  return cached;
}
