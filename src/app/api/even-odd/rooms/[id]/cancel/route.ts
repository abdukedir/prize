import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    ensureCsrf(req);
    const user = await requireUser();

    await prisma.$transaction(async (tx) => {
      const room = await tx.evenOddRoom.findFirst({
        where: { id: params.id, tenantId: user.tenantId, status: "WAITING" },
        include: { bets: true }
      });
      if (!room) throw new Response("Room not available", { status: 404 });
      if (room.bets.length !== 1) throw new Response("Room cannot be cancelled after an opponent joins", { status: 409 });

      const bet = room.bets[0];
      await tx.evenOddRoom.update({
        where: { id: room.id },
        data: { status: "CANCELLED" }
      });
      await tx.participant.update({
        where: { id: bet.participantId },
        data: { balance: { increment: bet.amount } }
      });
    });

    await logActivity(user.id, user.tenantId, `Cancelled Even/Odd room ${params.id}`);
    return ok({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
