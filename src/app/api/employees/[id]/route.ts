import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, noContent, ok, parseJson } from "@/lib/api";
import { hashPassword, logActivity, requireUser } from "@/lib/auth";
import { employeeSchema } from "@/lib/validators";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureCsrf(req);
    const actor = await requireUser(["ADMIN"]);
    const { id } = await ctx.params;
    const data = await parseJson(req, employeeSchema.partial());
    const employee = await prisma.user.update({
      where: { id, tenantId: actor.tenantId, role: "EMPLOYEE" },
      data: {
        name: data.name,
        email: data.email,
        disabled: data.disabled,
        password: data.password ? await hashPassword(data.password) : undefined
      },
      select: { id: true, name: true, email: true, role: true, disabled: true, createdAt: true }
    });
    await logActivity(actor.id, actor.tenantId, `Updated employee ${employee.email}`);
    return ok({ employee });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureCsrf(req);
    const actor = await requireUser(["ADMIN"]);
    const { id } = await ctx.params;
    const employee = await prisma.user.delete({ where: { id, tenantId: actor.tenantId, role: "EMPLOYEE" } });
    await logActivity(actor.id, actor.tenantId, `Deleted employee ${employee.email}`);
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
