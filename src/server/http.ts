import "server-only";
import { ObjectId } from "mongodb";
import { MongoServerSelectionError, MongoNetworkError } from "mongodb";
import { z } from "zod";
import { AppError, badRequest, forbidden, notFound } from "./errors";
import { requireApiUser, type SessionUser } from "./session";
import { ensureIndexes } from "./db/collections";

type RouteContext<P> = { params: Promise<P> };

interface HandlerArgs<P> {
  request: Request;
  user: SessionUser;
  params: P;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Wraps an authenticated Route Handler:
 * 1. rejects cross-site mutating requests (CSRF defence in addition to SameSite cookies),
 * 2. resolves the user from the verified session (401 otherwise),
 * 3. converts thrown errors into safe JSON responses without leaking internals.
 */
export function authedRoute<P = Record<string, never>>(
  handler: (args: HandlerArgs<P>) => Promise<Response>,
) {
  return async (request: Request, context: RouteContext<P>): Promise<Response> => {
    try {
      if (MUTATING_METHODS.has(request.method)) assertSameOrigin(request);
      const user = await requireApiUser(request);
      await ensureIndexes();
      const params = context?.params ? await context.params : ({} as P);
      return await handler({ request, user, params });
    } catch (error) {
      return errorResponse(error, request);
    }
  };
}

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, { ...init, headers: { "Cache-Control": "no-store", ...init?.headers } });
}

export function errorResponse(error: unknown, request?: Request): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors } },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const route = request ? `${request.method} ${new URL(request.url).pathname}` : "unknown route";
  if (error instanceof MongoServerSelectionError || error instanceof MongoNetworkError) {
    console.error(`[api] database unavailable on ${route}: ${error.name}`);
    return Response.json(
      { error: { code: "DB_UNAVAILABLE", message: "The database is temporarily unavailable. Please try again." } },
      { status: 503 },
    );
  }
  // Log a diagnostic without request bodies (which contain financial data).
  console.error(`[api] unexpected error on ${route}:`, error instanceof Error ? `${error.name}: ${error.message}` : error);
  return Response.json(
    { error: { code: "INTERNAL", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return; // non-browser clients; cookies are SameSite=Lax regardless
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Invalid request origin.");
  }
  if (originHost !== host) throw forbidden("Cross-site requests are not allowed.");
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const flattened = z.flattenError(result.error);
    const fieldErrors = flattened.fieldErrors as Record<string, string[]>;
    const first = Object.values(fieldErrors)[0]?.[0] ?? flattened.formErrors[0] ?? "Invalid input.";
    throw badRequest(first, fieldErrors);
  }
  return result.data;
}

/** Parses a route param as an ObjectId; malformed ids are reported as not found. */
export function toObjectId(value: string | undefined | null, what = "Record"): ObjectId {
  if (!value || !ObjectId.isValid(value) || !/^[a-f0-9]{24}$/i.test(value)) throw notFound(what);
  return new ObjectId(value);
}
