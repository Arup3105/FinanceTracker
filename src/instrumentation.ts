/**
 * Runs once when a server instance starts. Validates configuration early so a
 * missing variable produces a clear message in the logs instead of a vague
 * failure on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getEnv } = await import("@/lib/env");
  try {
    getEnv();
  } catch (error) {
    console.error(`\n[config] ${error instanceof Error ? error.message : String(error)}\n`);
  }
}
