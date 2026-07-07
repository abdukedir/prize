import { EvenOddSide, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { asNumber, getSettings } from "@/lib/games/numbers";

export const EVEN_ODD_TIMEOUT_MINUTES = 10;

export function oppositeSide(side: EvenOddSide): EvenOddSide {
  return side === "EVEN" ? "ODD" : "EVEN";
}

export function sideForNumber(number: number): EvenOddSide {
  return number % 2 === 0 ? "EVEN" : "ODD";
}

export function serializeEvenOddRound(round: {
  id: string;
  number: number;
  status: string;
  selectedNumber: number | null;
  winningSide: EvenOddSide | null;
  publishedAt: Date | null;
  publishedByName: string | null;
}) {
  return {
    id: round.id,
    number: round.number,
    status: round.status,
    selectedNumber: round.selectedNumber,
    winningSide: round.winningSide,
    publishedAt: round.publishedAt?.toISOString() ?? null,
    publishedByName: round.publishedByName
  };
}

export function serializeEvenOddRoom(room: {
  id: string;
  roomNumber: number;
  creatorSide: EvenOddSide;
  targetAmount: unknown;
  status: string;
  winnerSide: EvenOddSide | null;
  platformFee: unknown;
  totalPayout: unknown;
  matchedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  bets: {
    id: string;
    participantId: string;
    side: EvenOddSide;
    amount: unknown;
    payout: unknown;
    participant: { fullName: string; balance: unknown };
  }[];
}) {
  const bets = room.bets.map((bet) => ({
    id: bet.id,
    participantId: bet.participantId,
    participantName: bet.participant.fullName,
    side: bet.side,
    amount: asNumber(bet.amount),
    payout: asNumber(bet.payout),
    balance: asNumber(bet.participant.balance)
  }));
  const evenTotal = bets.filter((bet) => bet.side === "EVEN").reduce((sum, bet) => sum + bet.amount, 0);
  const oddTotal = bets.filter((bet) => bet.side === "ODD").reduce((sum, bet) => sum + bet.amount, 0);
  const targetAmount = asNumber(room.targetAmount);

  return {
    id: room.id,
    roomNumber: room.roomNumber,
    creatorSide: room.creatorSide,
    targetAmount,
    status: room.status,
    winnerSide: room.winnerSide,
    platformFee: asNumber(room.platformFee),
    totalPayout: asNumber(room.totalPayout),
    evenTotal,
    oddTotal,
    remaining: Math.max(0, targetAmount - Math.min(evenTotal, oddTotal)),
    matchedAt: room.matchedAt?.toISOString() ?? null,
    completedAt: room.completedAt?.toISOString() ?? null,
    expiresAt: room.expiresAt.toISOString(),
    createdAt: room.createdAt.toISOString(),
    bets
  };
}

export async function getOpenEvenOddRound(tenantId: string) {
  const open = await prisma.evenOddRound.findFirst({
    where: { tenantId, status: "OPEN" },
    orderBy: { number: "desc" }
  });
  if (open) return open;

  const latest = await prisma.evenOddRound.findFirst({ where: { tenantId }, orderBy: { number: "desc" } });
  return prisma.evenOddRound.create({
    data: {
      tenantId,
      number: (latest?.number ?? 1057) + 1
    }
  });
}

export async function refundExpiredEvenOddRooms(tenantId: string) {
  const expiredRooms = await prisma.evenOddRoom.findMany({
    where: {
      tenantId,
      status: "WAITING",
      expiresAt: { lte: new Date() }
    },
    include: { bets: true }
  });

  if (expiredRooms.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const room of expiredRooms) {
      await tx.evenOddRoom.updateMany({
        where: { id: room.id, status: "WAITING" },
        data: { status: "REFUNDED" }
      });

      for (const bet of room.bets) {
        await tx.participant.update({
          where: { id: bet.participantId },
          data: { balance: { increment: bet.amount } }
        });
      }
    }
  });
}

export async function processEvenOddRoundResult(tenantId: string, roundId: string, selectedNumber: number, employee: { id: string; name: string }) {
  const winningSide = sideForNumber(selectedNumber);

return prisma.$transaction(async (tx) => {
    const round = await tx.evenOddRound.findFirst({
      where: { id: roundId, tenantId },
      include: {
        rooms: {
          where: {
            OR: [
              { status: "MATCHED" },
              { status: "WAITING", expiresAt: { gt: new Date() } }
            ]
          },
          include: { bets: true }
        }
      }
    });

    if (!round) throw new Response("Round not found", { status: 404 });
    if (round.status === "PUBLISHED") throw new Response("Result already published", { status: 409 });

const settings = await getSettings(tenantId);
    const feePercentage = new Prisma.Decimal(settings.adminFeePercentage ?? 10);

    for (const room of round.rooms) {
      const winningBets = room.bets.filter((bet) => bet.side === winningSide);
      const losingBets = room.bets.filter((bet) => bet.side !== winningSide);
      const winningTotal = winningBets.reduce((sum, bet) => sum.plus(bet.amount), new Prisma.Decimal(0));
      const losingTotal = losingBets.reduce((sum, bet) => sum.plus(bet.amount), new Prisma.Decimal(0));
      const totalPot = winningTotal.plus(losingTotal);
      const platformFee = losingTotal.mul(feePercentage.div(100));
      const prizePool = totalPot.minus(platformFee);
      let totalPayout = new Prisma.Decimal(0);

      if (winningBets.length > 0) {
        const winner = winningBets[0];
        const payout = prizePool;
        totalPayout = payout;

        await tx.evenOddBet.update({
          where: { id: winner.id },
          data: { payout: payout }
        });
        await tx.participant.update({
          where: { id: winner.participantId },
          data: { balance: { increment: payout }, status: "WINNER" }
        });
      }

      for (const bet of winningBets.slice(1)) {
        await tx.evenOddBet.update({
          where: { id: bet.id },
          data: { payout: new Prisma.Decimal(0) }
        });
        await tx.participant.update({
          where: { id: bet.participantId },
          data: { status: "LOST" }
        });
      }

      for (const bet of losingBets) {
        await tx.participant.update({
          where: { id: bet.participantId },
          data: { status: "LOST" }
        });
      }

      await tx.evenOddRoom.update({
        where: { id: room.id },
        data: {
          status: "COMPLETED",
          winnerSide: winningSide,
          platformFee,
          totalPayout,
          completedAt: new Date()
        }
      });
    }

    const published = await tx.evenOddRound.update({
      where: { id: round.id },
      data: {
        status: "PUBLISHED",
        selectedNumber,
        winningSide,
        publishedById: employee.id,
        publishedByName: employee.name,
        publishedAt: new Date()
      }
    });

    await tx.evenOddRound.create({
      data: {
        tenantId,
        number: round.number + 1
      }
    });

    return published;
  });
}

