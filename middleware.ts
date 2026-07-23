import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareSupabaseClient } from "@/lib/auth/middleware-client";
import { isOwnerEmail } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/forbidden", "/auth/callback"];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createMiddlewareSupabaseClient(request, response);

  // Always call getUser() (not getSession()) in middleware — it revalidates
  // the token against Supabase instead of trusting an unverified cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  if (!user) {
    if (isPublicPath) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (!isOwnerEmail(user.email)) {
    if (pathname === "/forbidden") return response;
    const url = request.nextUrl.clone();
    url.pathname = "/forbidden";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" || pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // api/* routes (webhook receivers, cron triggers) authenticate themselves — HMAC
    // signatures, CRON_SECRET — and must never be gated by the owner session check.
    // robots.txt must be reachable by crawlers without a session, same as favicon.ico.
    "/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
