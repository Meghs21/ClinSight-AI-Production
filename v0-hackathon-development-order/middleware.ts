import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/auth/login") ||
    pathname.startsWith("/auth/register") ||
    pathname.startsWith("/aiuth/login") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register")
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authCookie = req.cookies.get("medai_auth")?.value;
  // Valid authentication cookie must exist and be non-empty token string
  const isLoggedIn = Boolean(authCookie && authCookie.length >= 1 && authCookie !== "0");

  if (!isLoggedIn && !isPublicPath(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && isPublicPath(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
