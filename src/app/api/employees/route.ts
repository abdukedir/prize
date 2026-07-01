import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok, parseJson } from "@/lib/api";
import { hashPassword, logActivity, requireUser } from "@/lib/auth";
import { employeeSchema } from "@/lib/validators";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(["ADMIN"]);
    const search = req.nextUrl.searchParams.get("search") ?? "";
    const employees = await prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        role: "EMPLOYEE",
        OR: search ? [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] : undefined
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, role: true, disabled: true, createdAt: true }
    });
    return ok({ employees });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser(["ADMIN"]);
    const data = await parseJson(req, employeeSchema.required({ password: true }));
    const employee = await prisma.user.create({
      data: {
        tenantId: user.tenantId,
        name: data.name,
        email: data.email,
        password: await hashPassword(data.password),
        role: "EMPLOYEE",
        disabled: data.disabled ?? false
      },
      select: { id: true, name: true, email: true, role: true, disabled: true, createdAt: true }
    });
    await logActivity(user.id, user.tenantId, `Created employee ${employee.email}`);
    return ok({ employee }, 201);
  } catch (error) {
    return handleError(error);
  }
}
