import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookies, currentUser, logActivity } from "@/lib/auth";
import { ensureCsrf, handleError } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await currentUser();
    if (user) await logActivity(user.id, user.tenantId, "Logged out");
    const res = NextResponse.json({ ok: true });
    clearAuthCookies(res);
    return res;
  } catch (error) {
    return handleError(error);
  }
}
