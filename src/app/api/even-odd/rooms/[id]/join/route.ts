import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok, parseJson } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { oppositeSide } from "@/lib/games/even-odd";
import { evenOddJoinRoomSchema } from "@/lib/validators";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    const data = await parseJson(req, evenOddJoinRoomSchema);

    await prisma.$transaction(async (tx) => {
      const room = await tx.evenOddRoom.findFirst({
        where: { id: params.id, tenantId: user.tenantId, status: "WAITING" },
        include: { bets: true }
      });
      if (!room) throw new Response("Room not available", { status: 404 });
      if (room.expiresAt <= new Date()) throw new Response("Room has expired", { status: 409 });

      const participant = await tx.participant.findFirst({
        where: { id: data.participantId, tenantId: user.tenantId, status: { not: "DISABLED" } }
      });
      if (!participant) throw new Response("Participant not found", { status: 404 });

      const joinSide = oppositeSide(room.creatorSide);
      const amount = new Prisma.Decimal(data.amount);
      const targetAmount = new Prisma.Decimal(room.targetAmount);
      const currentJoinTotal = room.bets
        .filter((bet) => bet.side === joinSide)
        .reduce((sum, bet) => sum.plus(bet.amount), new Prisma.Decimal(0));
      const nextJoinTotal = currentJoinTotal.plus(amount);

      if (nextJoinTotal.gt(targetAmount)) throw new Response("Amount exceeds remaining room total", { status: 400 });

      await tx.evenOddBet.create({
        data: {
          tenantId: user.tenantId,
          roomId: room.id,
          participantId: data.participantId,
          side: joinSide,
          amount: amount
        }
      });
      await tx.participant.update({
        where: { id: data.participantId },
        data: { balance: { decrement: amount } }
      });

      if (nextJoinTotal.equals(targetAmount)) {
        await tx.evenOddRoom.update({
          where: { id: room.id },
          data: { status: "MATCHED", matchedAt: new Date() }
        });
      }
    });

    await logActivity(user.id, user.tenantId, `Joined Even/Odd room ${params.id}`);
    return ok({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
