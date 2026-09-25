import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionJwt } from "@/lib/auth/jwt";

/**
 * Edge gate. It only checks that a *structurally valid* session cookie exists so
 * unauthenticated traffic never reaches the app router. Real authorisation
 * (session row lookup, role checks) happens in server components/actions.
 *
 * `/api/remote` is public here because it authenticates node tokens itself,
 * `/api/client` is public because it authenticates API-key Bearer tokens in the
 * route handlers (and enforces scopes there), and `/install` serves the daemon
 * installer, which is fetched by curl on a machine that has no panel session.
 */

const PUBLIC_PREFIXES = [
  "/", // public marketing landing (exact match only, see isPublic)
  "/pricing",
  "/docs",
  "/status",
  "/auth",
  "/api/remote",
  "/api/client",
  "/api/health",
  "/install",
  "/_next",
  "/favicon",
  "/uploads",
];

/**
 * Auth entry pages that a signed-in user should never see again — they get
 * bounced to the dashboard. `/auth/verify` and `/auth/reset` are intentionally
 * omitted: those are token-driven flows a logged-in user may still need (e.g.
 * confirming their email address, or completing a reset link from their inbox).
 */
const AUTH_ENTRY_PAGES = ["/auth/login", "/auth/register", "/auth/forgot"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isAuthEntryPage(pathname: string): boolean {
  return AUTH_ENTRY_PAGES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const jwt = cookie ? cookie.slice(0, cookie.lastIndexOf(".")) : "";
  const claims = jwt ? await verifySessionJwt(jwt) : null;

  // A signed-in user has no business on the login/register/forgot pages.
  if (claims && isAuthEntryPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isPublic(pathname)) return NextResponse.next();

  if (!claims) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Staff (admin + support) may enter /admin. Per-page requireAdmin/requireStaff
  // guards and staffCan() checks in server actions enforce the finer-grained
  // authorisation; this edge gate only blocks plain "user" accounts.
  if (pathname.startsWith("/admin") && claims.role !== "admin" && claims.role !== "support") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "?error=forbidden";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/|install/|textures/).*)"],
};
