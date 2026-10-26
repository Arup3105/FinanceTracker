import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic redirect for signed-out visitors. This only checks that a session
 * cookie exists; every page and API route still verifies the session against
 * the database before reading or writing any data.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/expenses/:path*",
    "/income/:path*",
    "/savings/:path*",
    "/reports/:path*",
    "/accounts/:path*",
    "/transfers/:path*",
    "/settings/:path*",
  ],
};
