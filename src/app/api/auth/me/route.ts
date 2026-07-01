import { NextResponse } from "next/server";
import { clearAuthCookies, currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await currentUser();
  const hasUsers = (await prisma.user.count()) > 0;
  const res = NextResponse.json({ user, hasUsers });
  if (!user) clearAuthCookies(res);
  return res;
}
