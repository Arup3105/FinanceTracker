import { randomUUID } from "node:crypto";
import { getAuth } from "@/lib/auth";
import { toLocalDateTimeInput } from "@/lib/dates";
import { getDb, getMongoClient } from "@/server/db/client";

export const IST = "Asia/Kolkata";

export interface TestUser {
  id: string;
  email: string;
  cookie: string;
}

/** Drops every collection in the dedicated test database (name guarded in setup-env.ts). */
export async function resetDatabase() {
  const db = getDb();
  if (!/test/i.test(db.databaseName)) throw new Error("Refusing to reset a non-test database.");
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  await Promise.all(collections.map((c) => db.collection(c.name).deleteMany({})));
}

export async function closeDatabase() {
  await getMongoClient().close();
}

/** Registers a real user through Better Auth and returns its session cookie. */
export async function createUser(label: string): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const response = await getAuth().api.signUpEmail({
    body: { name: label, email, password: "correct-horse-battery-staple" },
    asResponse: true,
  });
  if (!response.ok) throw new Error(`sign-up failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { user: { id: string } };
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { id: body.user.id, email, cookie };
}

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

export interface CallOptions {
  method?: string;
  path?: string;
  body?: unknown;
  user?: TestUser | null;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface CallResult<T = unknown> {
  status: number;
  body: { data?: T; error?: { code: string; message: string; fieldErrors?: Record<string, string[]> } };
  text: string;
  headers: Headers;
}

/** Invokes a Route Handler exactly as Next.js would, with the user's session cookie. */
export async function call<T = unknown>(handler: unknown, options: CallOptions = {}): Promise<CallResult<T>> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { host: "localhost:3000", ...options.headers };
  if (options.user) headers.cookie = options.user.cookie;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers.origin ??= "http://localhost:3000";
  const request = new Request(`http://localhost:3000${options.path ?? "/api/test"}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const response = await (handler as Handler)(request, { params: Promise.resolve(options.params ?? {}) });
  const text = await response.text();
  let body: CallResult<T>["body"] = {};
  try {
    body = JSON.parse(text);
  } catch {
    // CSV and other non-JSON responses
  }
  return { status: response.status, body, text, headers: response.headers };
}

/** A wall-clock time `minutesAgo` before now, in IST, formatted for the API. */
export function localNow(minutesAgo = 1): string {
  return toLocalDateTimeInput(new Date(Date.now() - minutesAgo * 60_000), IST);
}

export const key = () => randomUUID();
