import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

const publicPaths = ["/login", "/setup", "/api/auth/login", "/api/auth/bootstrap"];
const adminOnlyPaths = ["/employees", "/audit", "/backup"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/_next") || pathname.includes(".") || publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const user = await verifySessionToken(req.cookies.get("gpm_session")?.value);
  if (!user) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (adminOnlyPaths.some((path) => pathname.startsWith(path)) && user.role !== "ADMIN" && user.role !== "SUPERADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth/me).*)"]
};
