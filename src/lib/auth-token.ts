import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

const encoder = new TextEncoder();

export type SessionUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: Role;
};

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");
  return encoder.encode(secret);
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
