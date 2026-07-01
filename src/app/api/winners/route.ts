import { prisma } from "@/lib/prisma";
import { handleError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const winners = await prisma.winner.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
      include: { participant: true, selectedBy: { select: { name: true, email: true } } }
    });
    return ok({
      winners: winners.map((winner) => ({
        id: winner.id,
        winnerName: winner.participant.fullName,
        prizeAmount: Number(winner.prizeAmount),
        roundNumber: winner.roundNumber,
        selectedBy: winner.selectedBy.name,
        createdAt: winner.createdAt
      }))
    });
  } catch (error) {
    return handleError(error);
  }
}
