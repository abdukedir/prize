import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bootstrapSchema } from "@/lib/validators";
import { csrfToken, hashPassword, setAuthCookies, signSession } from "@/lib/auth";
import { handleError, parseJson } from "@/lib/api";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function POST(req: NextRequest) {
  try {
    if ((await prisma.user.count()) > 0) {
      return NextResponse.json({ error: "System is already initialized" }, { status: 409 });
    }
    const data = await parseJson(req, bootstrapSchema);
    const tenant = await prisma.tenant.create({
      data: {
        name: data.tenantName,
        slug: slugify(data.tenantName) || "default",
        settings: { create: { adminFeePercentage: 10 } },
        rounds: { create: { number: 1, status: "OPEN" } }
      }
    });
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: data.name,
        email: data.email,
        password: await hashPassword(data.password),
        role: "ADMIN"
      }
    });
    await prisma.activityLog.create({ data: { tenantId: tenant.id, userId: user.id, action: "Initialized tenant" } });
    const token = await signSession({ id: user.id, tenantId: tenant.id, name: user.name, email: user.email, role: user.role });
    const csrf = csrfToken();
    const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, csrfToken: csrf });
    setAuthCookies(res, token, csrf);
    return res;
  } catch (error) {
    return handleError(error);
  }
}
