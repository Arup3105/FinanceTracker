import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { unauthorized } from "./errors";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/** Verifies the session cookie against the database. Never trusts client-supplied user ids. */
export async function getSessionUser(requestHeaders: Headers): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}

/** For Route Handlers: resolves the authenticated user or throws a 401 AppError. */
export async function requireApiUser(request: Request): Promise<SessionUser> {
  const user = await getSessionUser(request.headers);
  if (!user) throw unauthorized();
  return user;
}

/** For Server Components: resolves the authenticated user or redirects to the login page. */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getSessionUser(await headers());
  if (!user) redirect("/login");
  return user;
}
