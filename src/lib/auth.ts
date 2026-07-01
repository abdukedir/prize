import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const AUTH_COOKIE = "gpm_session";
const CSRF_COOKIE = "gpm_csrf";
const encoder = new TextEncoder();

export type SessionUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: Role;
};

export const adminRoles: Role[] = ["ADMIN", "SUPERADMIN"];

export function isSuperAdmin(user: SessionUser) {
  return user.role === "SUPERADMIN";
}

export function scopedTenantWhere(user: SessionUser) {
  return isSuperAdmin(user) ? {} : { tenantId: user.tenantId };
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");
  return encoder.encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signSession(user: SessionUser) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(jwtSecret());
}

export async function verifySessionToken(token?: string): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    return payload as SessionUser;
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const session = await verifySessionToken(store.get(AUTH_COOKIE)?.value);
  if (!session) return null;

  const user = await prisma.user.findFirst({
    where: {
      id: session.id,
      disabled: false,
      tenant: { is: { id: session.tenantId } }
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      email: true,
      role: true
    }
  });

  return user;
}

export async function requireUser(roles?: Role[]) {
  const user = await currentUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  if (roles?.length && !roles.includes(user.role)) throw new Response("Forbidden", { status: 403 });
  return user;
}

export function csrfToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function validateCsrf(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = req.headers.get("x-csrf-token");
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
}

export function setAuthCookies(res: NextResponse, token: string, csrf: string) {
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 8
  });
  res.cookies.set(CSRF_COOKIE, csrf, {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(CSRF_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function logActivity(userId: string | null, tenantId: string, action: string, metadata?: unknown) {
  await prisma.activityLog.create({
    data: {
      userId,
      tenantId,
      action,
      metadata: metadata === undefined ? undefined : (metadata as object)
    }
  });
}
