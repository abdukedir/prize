import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok, parseJson } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { calculatePrize, getOpenRound } from "@/lib/stats";
import { manualWinnerSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser(["ADMIN"]);
    const data = await parseJson(req, manualWinnerSchema);
    const participant = await prisma.participant.findFirstOrThrow({ where: { id: data.participantId, tenantId: user.tenantId } });
    const round = await getOpenRound(user.tenantId);
    const winner = await prisma.winner.create({
      data: {
        tenantId: user.tenantId,
        participantId: participant.id,
        selectedById: user.id,
        prizeAmount: await calculatePrize(user.tenantId),
        roundId: round.id,
        roundNumber: round.number
      },
      include: { participant: true, selectedBy: true }
    });
    await prisma.gameRound.update({ where: { id: round.id }, data: { status: "CLOSED", closedAt: new Date() } });
    await prisma.gameRound.create({ data: { tenantId: user.tenantId, number: round.number + 1, status: "OPEN" } });
    await logActivity(user.id, user.tenantId, `Selected manual winner ${participant.fullName}`);
    return ok({ winner: { ...winner, prizeAmount: Number(winner.prizeAmount) } }, 201);
  } catch (error) {
    return handleError(error);
  }
}
