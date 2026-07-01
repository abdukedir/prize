import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const roomId = pathParts[4];
    const oldAmount = url.searchParams.get("oldAmount");
    const oldSide = url.searchParams.get("oldSide");

    if (!roomId || !oldAmount || !oldSide) {
      return new Response("Missing parameters", { status: 400 });
    }

    const body = await req.json();
    const { amount: newAmount, side: newSide } = body;

    await prisma.$transaction(async (tx) => {
      const room = await tx.evenOddRoom.findFirst({
        where: { id: roomId, tenantId: user.tenantId },
        include: { bets: true }
      });
      if (!room) throw new Response("Room not found", { status: 404 });
    
      if (room.status !== "WAITING") {
        throw new Response("Cannot modify bet in a room that is not waiting", { status: 400 });
      }

      const existingBet = room.bets.find(
        (bet) => bet.amount.toString() === oldAmount && bet.side === oldSide
      );
      if (!existingBet) throw new Response("Bet not found", { status: 404 });

      const newAmountDecimal = new Prisma.Decimal(newAmount);
      const oldAmountDecimal = new Prisma.Decimal(oldAmount);
      const difference = newAmountDecimal.minus(oldAmountDecimal);

      await tx.evenOddBet.update({
        where: { id: existingBet.id },
        data: { amount: newAmountDecimal, side: newSide }
      });

      await tx.participant.update({
        where: { id: existingBet.participantId },
        data: { balance: { decrement: difference } }
      });
    });

    return ok({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return handleError(error);
  }
}