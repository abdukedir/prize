import { EvenOddSide, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { asNumber } from "@/lib/games/numbers";

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

export async function getOpenEvenOddRound(tenantId: string, createdById: string) {
  const open = await prisma.evenOddRound.findFirst({
    where: { tenantId, createdById, status: "OPEN" },
    orderBy: { number: "desc" }
  });
  if (open) return open;

  const latest = await prisma.evenOddRound.findFirst({ where: { tenantId, createdById }, orderBy: { number: "desc" } });
  return prisma.evenOddRound.create({
    data: {
      tenantId,
      createdById,
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

export function getFeeForAmount(amount: number, tiers: Array<{ minAmount: number; feePercentage: number }> = [], defaultFee = 10): number {
  if (!tiers.length) return defaultFee;
  const sorted = [...tiers].sort((a, b) => a.minAmount - b.minAmount);
  let fee = defaultFee;
  for (const tier of sorted) {
    if (amount >= tier.minAmount) fee = tier.feePercentage;
  }
  return fee;
}

export async function processEvenOddRoundResult(tenantId: string, roundId: string, winningSide: EvenOddSide, employee: { id: string; name: string }, houseFeeTiers: Array<{ minAmount: number; feePercentage: number }> = [], defaultFee = 10) {
   return prisma.$transaction(async (tx) => {
     const round = await tx.evenOddRound.findFirst({
       where: { id: roundId, tenantId },
       include: {
         rooms: {
           where: { status: { in: ["WAITING", "MATCHED"] } },
           include: { bets: true }
         }
       }
     });

     if (!round) throw new Response("Round not found", { status: 404 });
     if (round.status === "PUBLISHED") throw new Response("Result already published", { status: 409 });

      for (const room of round.rooms) {
        const winningBets = room.bets.filter((bet) => bet.side === winningSide);
        const losingBets = room.bets.filter((bet) => bet.side !== winningSide);
        const winningTotal = winningBets.reduce((sum, bet) => sum.plus(bet.amount), new Prisma.Decimal(0));
        const losingTotal = losingBets.reduce((sum, bet) => sum.plus(bet.amount), new Prisma.Decimal(0));
        const totalPot = winningTotal.plus(losingTotal);

        let platformFee = new Prisma.Decimal(0);
        for (const bet of losingBets) {
          const feePercentage = getFeeForAmount(Number(bet.amount), houseFeeTiers);
          platformFee = platformFee.plus(new Prisma.Decimal(bet.amount).mul(feePercentage).div(100));
        }
        const totalPayout = winningTotal.plus(losingTotal).minus(platformFee);

        if (winningBets.length > 0) {
          for (const bet of winningBets) {
            const shareOfLosingSide = losingTotal.div(winningBets.length);
            const payout = bet.amount.plus(shareOfLosingSide.minus(platformFee.div(winningBets.length)));
            await tx.evenOddBet.update({
              where: { id: bet.id },
              data: { payout: payout }
            });
            await tx.participant.update({
              where: { id: bet.participantId },
              data: { balance: { increment: payout }, status: "WINNER" }
            });
          }
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
          winningSide,
          publishedById: employee.id,
          publishedByName: employee.name,
          publishedAt: new Date()
        }
      });

     await tx.evenOddRound.create({
       data: {
         tenantId,
         createdById: round.createdById,
         number: round.number + 1
       }
     });

     return published;
   });
 }
