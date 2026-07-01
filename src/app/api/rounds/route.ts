import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { getOpenRound } from "@/lib/stats";

export async function GET() {
  try {
    const user = await requireUser(["ADMIN"]);
    const rounds = await prisma.gameRound.findMany({ where: { tenantId: user.tenantId }, orderBy: { number: "desc" } });
    return ok({ rounds });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser(["ADMIN"]);
    const round = await getOpenRound(user.tenantId);
    await logActivity(user.id, user.tenantId, `Ensured round ${round.number} is open`);
    return ok({ round }, 201);
  } catch (error) {
    return handleError(error);
  }
}
