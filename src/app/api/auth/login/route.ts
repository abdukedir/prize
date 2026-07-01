import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { csrfToken, setAuthCookies, signSession, verifyPassword } from "@/lib/auth";
import { handleError, parseJson } from "@/lib/api";
import { loginSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    const data = await parseJson(req, loginSchema);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || user.disabled || !(await verifyPassword(data.password, user.password))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    const token = await signSession({
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      role: user.role
    });
    const csrf = csrfToken();
    const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, csrfToken: csrf });
    setAuthCookies(res, token, csrf);
    await prisma.activityLog.create({ data: { tenantId: user.tenantId, userId: user.id, action: "Logged in" } });
    return res;
  } catch (error) {
    return handleError(error);
  }
}
