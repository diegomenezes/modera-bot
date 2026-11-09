import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Checagem rápida, só pelo cookie. A verificação de verdade fica em src/lib/dal.ts.
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/webhook", "/r"];
// link redirecionador público: /grupo-<slug> vira a rota /r/<slug>
const REDIRECT_LINK = /^\/grupo-([a-z0-9]+)\/?$/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const link = REDIRECT_LINK.exec(pathname);
  if (link) return NextResponse.rewrite(new URL(`/r/${link[1]}`, request.url));
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
