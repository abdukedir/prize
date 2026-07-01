import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok, parseJson } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { getOpenEvenOddRound, serializeEvenOddRoom, serializeEvenOddRound, EVEN_ODD_TIMEOUT_MINUTES } from "@/lib/games/even-odd";
import { evenOddCreateRoomSchema } from "@/lib/validators";

const roomInclude = {
  bets: {
    orderBy: { createdAt: "asc" as const },
    include: { participant: { select: { fullName: true, balance: true } } }
  }
};

async function loadState(tenantId: string) {
  const round = await getOpenEvenOddRound(tenantId);
  const [rooms, latestResult, participants] = await Promise.all([
    prisma.evenOddRoom.findMany({
      where: { tenantId, roundId: round.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: roomInclude
    }),
    prisma.evenOddRound.findFirst({
      where: { tenantId, status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" }
    }),
    prisma.participant.findMany({
      where: { tenantId, status: { not: "DISABLED" } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, balance: true, status: true }
    })
  ]);

  return {
    round: serializeEvenOddRound(round),
    latestResult: latestResult ? serializeEvenOddRound(latestResult) : null,
    rooms: rooms.map(serializeEvenOddRoom),
    participants: participants.map((participant) => ({
      id: participant.id,
      name: participant.fullName,
      balance: Number(participant.balance),
      status: participant.status
    }))
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await loadState(user.tenantId));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    const data = await parseJson(req, evenOddCreateRoomSchema);
    const round = await getOpenEvenOddRound(user.tenantId);

    await prisma.$transaction(async (tx) => {
      const participant = await tx.participant.findFirst({
        where: { id: data.participantId, tenantId: user.tenantId, status: { not: "DISABLED" } }
      });
      if (!participant) throw new Response("Participant not found", { status: 404 });

      const latestRoom = await tx.evenOddRoom.findFirst({ where: { tenantId: user.tenantId }, orderBy: { roomNumber: "desc" } });
      const room = await tx.evenOddRoom.create({
        data: {
          tenantId: user.tenantId,
          roundId: round.id,
          roomNumber: (latestRoom?.roomNumber ?? 2547) + 1,
          creatorSide: data.side,
          targetAmount: data.amount,
          expiresAt: new Date(Date.now() + EVEN_ODD_TIMEOUT_MINUTES * 60 * 1000)
        }
      });

      await tx.evenOddBet.create({
        data: {
          tenantId: user.tenantId,
          roomId: room.id,
          participantId: data.participantId,
          side: data.side,
          amount: data.amount
        }
      });
      await tx.participant.update({
        where: { id: data.participantId },
        data: { balance: { decrement: data.amount } }
      });
    });

    await logActivity(user.id, user.tenantId, `Created Even/Odd room ${data.side} ${data.amount}`);
    return ok(await loadState(user.tenantId), 201);
  } catch (error) {
    return handleError(error);
  }
}
