import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, noContent, ok, parseJson } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { participantSchema } from "@/lib/validators";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    const { id } = await ctx.params;
    const data = await parseJson(req, participantSchema.partial());
    const participant = await prisma.participant.update({
      where: { id, tenantId: user.tenantId },
      data
    });
    await logActivity(user.id, user.tenantId, `Updated participant ${participant.fullName}`);
    return ok({ participant: { ...participant, amountDeposited: Number(participant.amountDeposited) } });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureCsrf(req);
    const user = await requireUser(["ADMIN"]);
    const { id } = await ctx.params;
    const participant = await prisma.participant.delete({ where: { id, tenantId: user.tenantId } });
    await logActivity(user.id, user.tenantId, `Deleted participant ${participant.fullName}`);
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
