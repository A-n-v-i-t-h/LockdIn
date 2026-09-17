import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

// Optimistic check only (signature and expiry). Pages and actions still verify
// the session against the database before touching any data.
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  // The login page checks the session against the database itself; a signed but
  // stale cookie (after a password change) must still reach the form.
  if (pathname === "/login") return NextResponse.next();
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/cron|icons/|sw\\.js|manifest\\.webmanifest|favicon\\.ico|offline\\.html|robots\\.txt).*)",
  ],
};
