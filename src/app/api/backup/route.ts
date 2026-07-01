import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser(["ADMIN"]);
    const [tenant, users, participants, winners, settings, rounds, activityLogs] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: user.tenantId } }),
      prisma.user.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true, email: true, role: true, disabled: true, createdAt: true } }),
      prisma.participant.findMany({ where: { tenantId: user.tenantId } }),
      prisma.winner.findMany({ where: { tenantId: user.tenantId } }),
      prisma.setting.findUnique({ where: { tenantId: user.tenantId } }),
      prisma.gameRound.findMany({ where: { tenantId: user.tenantId } }),
      prisma.activityLog.findMany({ where: { tenantId: user.tenantId }, take: 500, orderBy: { createdAt: "desc" } })
    ]);
    return ok({ exportedAt: new Date().toISOString(), tenant, users, participants, winners, settings, rounds, activityLogs });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser(["ADMIN"]);
    const body = await req.json();
    if (!Array.isArray(body.participants)) return ok({ error: "Invalid backup file" }, 400);
    await prisma.$transaction(async (tx) => {
      await tx.participant.deleteMany({ where: { tenantId: user.tenantId } });
      await tx.participant.createMany({
        data: body.participants.map((p: { fullName: string; phoneNumber: string; amountDeposited: number }) => ({
          tenantId: user.tenantId,
          fullName: p.fullName,
          phoneNumber: p.phoneNumber,
          amountDeposited: p.amountDeposited
        }))
      });
    });
    await logActivity(user.id, user.tenantId, "Restored participants from backup");
    return ok({ restored: body.participants.length });
  } catch (error) {
    return handleError(error);
  }
}
