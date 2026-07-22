import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { ownerIdFromRequestUrl, resolveBoardOwner } from "@/lib/board-owner";
import { oppositeSide } from "@/lib/games/even-odd";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    const ownerId = await resolveBoardOwner(user, ownerIdFromRequestUrl(req.url));
    const url = new URL(req.url);
    const betId = url.searchParams.get("betId");
    if (!betId) throw new Response("betId is required", { status: 400 });

    await prisma.$transaction(async (tx) => {
      const bet = await tx.evenOddBet.findFirst({
        where: { id: betId, tenantId: user.tenantId, room: { id: params.id, status: "WAITING", round: { createdById: ownerId } } },
        include: { room: { include: { bets: true } } }
      });
      if (!bet) throw new Response("Bet not found", { status: 404 });

      const amountDecimal = new Prisma.Decimal(bet.amount);
      await tx.evenOddBet.delete({ where: { id: bet.id } });
      await tx.participant.update({
        where: { id: bet.participantId },
        data: { balance: { increment: amountDecimal } }
      });

      const remainingBets = bet.room.bets.filter((b) => b.id !== bet.id);
      if (remainingBets.length === 0) {
        await tx.evenOddRoom.update({
          where: { id: params.id },
          data: { status: "CANCELLED" }
        });
      }
    });

    await logActivity(user.id, user.tenantId, `Removed Even/Odd bet ${betId}`);
    return ok({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return handleError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    const ownerId = await resolveBoardOwner(user, ownerIdFromRequestUrl(req.url));
    
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

    if (!["EVEN", "ODD"].includes(newSide)) {
      return new Response("Invalid side", { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const room = await tx.evenOddRoom.findFirst({
        where: { id: roomId, tenantId: user.tenantId, round: { createdById: ownerId } },
        include: { bets: true }
      });
      if (!room) throw new Response("Room not found", { status: 404 });
    
      if (room.status !== "WAITING") {
        throw new Response("Cannot modify bet in a room that is not waiting", { status: 400 });
      }

      const joinSide = oppositeSide(room.creatorSide);
      if (newSide !== joinSide) {
        throw new Response("Can only bet on the opposite side of the room creator", { status: 400 });
      }

      const existingBet = room.bets.find(
        (bet) => bet.amount.toString() === oldAmount && bet.side === oldSide
      );
      if (!existingBet) throw new Response("Bet not found", { status: 404 });

      const newAmountDecimal = new Prisma.Decimal(newAmount);
      const oldAmountDecimal = new Prisma.Decimal(oldAmount);
      const difference = newAmountDecimal.minus(oldAmountDecimal);

      const currentJoinTotal = room.bets
        .filter((bet) => bet.side === joinSide && bet.id !== existingBet.id)
        .reduce((sum, bet) => sum.plus(bet.amount), new Prisma.Decimal(0));
      const nextJoinTotal = currentJoinTotal.plus(newAmountDecimal);

      if (nextJoinTotal.gt(room.targetAmount)) {
        throw new Response("Amount exceeds remaining room total", { status: 400 });
      }

      await tx.evenOddBet.update({
        where: { id: existingBet.id },
        data: { amount: newAmountDecimal, side: newSide }
      });

      await tx.participant.update({
        where: { id: existingBet.participantId },
        data: { balance: difference.isNegative() ? { increment: difference.abs() } : { decrement: difference } }
      });
      
      if (nextJoinTotal.equals(room.targetAmount)) {
        await tx.evenOddRoom.update({
          where: { id: room.id },
          data: { status: "MATCHED", matchedAt: new Date() }
        });
      }
    });

    return ok({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      console.log("[PATCH bets] rejected:", error.status, await error.text().catch(() => "unknown"));
      return error;
    }
    console.log("[PATCH bets] error:", error);
    return handleError(error);
  }
}
