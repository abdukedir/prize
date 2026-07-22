import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok, parseJson } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { ownerIdFromRequestUrl, resolveBoardOwner } from "@/lib/board-owner";
import { asNumber, getOpenNumbersGame, getSettings } from "@/lib/games/numbers";
import { processEvenOddRoundResult, sideForNumber } from "@/lib/games/even-odd";
import { finishNumbersGameSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);

    const user = await requireUser();
    const ownerId = await resolveBoardOwner(user, ownerIdFromRequestUrl(req.url));
    const data = await parseJson(req, finishNumbersGameSchema);
    const settings = await getSettings(user.tenantId);
    const game = await getOpenNumbersGame(user.tenantId, ownerId);

    const result = await prisma.$transaction(async (tx) => {
      const entries = await tx.entry.findMany({
        where: { tenantId: user.tenantId, gameId: game.id },
        include: { participant: true }
      });

      if (entries.length === 0) {
        throw new Response("Assign at least one number before finishing the game", { status: 400 });
      }

      const firstEntries = entries.filter((entry) => entry.selectedNumber === data.firstPrizeNumber);
      const secondEntries = entries.filter((entry) => entry.selectedNumber === data.secondPrizeNumber);

      if (firstEntries.length === 0 || secondEntries.length === 0) {
        throw new Response("Both prize numbers must be assigned before finishing the game", { status: 400 });
      }

      const zero = new Prisma.Decimal(0);
      const ticketPrice = new Prisma.Decimal(settings.ticketPrice);
      const employeeRate = new Prisma.Decimal(settings.winnerRate);

      const totalSales = entries.reduce((sum, entry) => sum.plus(entry.ticketPrice), zero);
      const firstPrize = totalSales.minus(employeeRate).minus(ticketPrice);
      const secondPrize = ticketPrice;
      const payoutByParticipant = new Map<string, Prisma.Decimal>();
      const winnerParticipantIds = new Set<string>();
      const winnerRows: {
        tenantId: string;
        participantId: string;
        prizeAmount: Prisma.Decimal;
        rateDeduction: Prisma.Decimal;
        prizeRank: "FIRST" | "SECOND";
        selectedById: string;
        roundId: string;
        roundNumber: number;
      }[] = [];

      function addPrize(entry: (typeof entries)[number], prizeAmount: Prisma.Decimal, prizeRank: "FIRST" | "SECOND", rateDeduction: Prisma.Decimal) {
        const ratio = new Prisma.Decimal(entry.ticketPrice).div(ticketPrice);
        const payout = prizeAmount.mul(ratio);
        const nextPayout = (payoutByParticipant.get(entry.participantId) ?? zero).plus(payout);
        payoutByParticipant.set(entry.participantId, nextPayout);
        winnerParticipantIds.add(entry.participantId);
        winnerRows.push({
          tenantId: user.tenantId,
          participantId: entry.participantId,
          prizeAmount: payout,
          rateDeduction: rateDeduction.mul(ratio),
          prizeRank,
          selectedById: user.id,
          roundId: game.id,
          roundNumber: game.number
        });
      }

      for (const entry of firstEntries) addPrize(entry, firstPrize, "FIRST", employeeRate);
      for (const entry of secondEntries) addPrize(entry, secondPrize, "SECOND", zero);

      const participantIds = new Set<string>();

      for (const entry of entries) {
        participantIds.add(entry.participantId);
      }

      for (const participantId of participantIds) {
        const balanceIncrement = payoutByParticipant.get(participantId) ?? zero;
        const isWinner = winnerParticipantIds.has(participantId);

        await tx.participant.update({
          where: { id: participantId },
          data: {
            balance: { increment: balanceIncrement },
            status: isWinner ? "WINNER" : "LOST"
          }
        });
      }

      await tx.winner.createMany({
        data: winnerRows
      });

      const firstPrizePaid = firstEntries.reduce((sum, entry) => sum.plus(firstPrize.mul(new Prisma.Decimal(entry.ticketPrice).div(ticketPrice))), zero);
      const secondPrizePaid = secondEntries.reduce((sum, entry) => sum.plus(secondPrize.mul(new Prisma.Decimal(entry.ticketPrice).div(ticketPrice))), zero);
      const totalPrizePaid = firstPrizePaid.plus(secondPrizePaid);
      const netIncome = totalSales.minus(totalPrizePaid);
      const report = await tx.report.create({
        data: {
          tenantId: user.tenantId,
          gameId: game.id,
          gameType: "NUMBERS",
          gameCount: 1,
          participantCount: participantIds.size,
          ticketPrice,
          totalSales,
          firstPrizePaid,
          secondPrizePaid,
          winnerRateDeduction: employeeRate,
          netIncome
        }
      });

      await tx.gameRound.update({
        where: { id: game.id },
        data: { status: "CLOSED", closedAt: new Date() }
      });

      await tx.gameRound.create({
        data: {
          tenantId: user.tenantId,
          createdById: ownerId,
          number: game.number + 1,
          gameType: "NUMBERS"
        }
      });

      return {
        report: {
          id: report.id,
          totalSales: asNumber(report.totalSales),
          firstPrizePaid: asNumber(report.firstPrizePaid),
          secondPrizePaid: asNumber(report.secondPrizePaid),
          winnerRateDeduction: asNumber(report.winnerRateDeduction),
          netIncome: asNumber(report.netIncome)
        },
        winningNumber: data.firstPrizeNumber
      };
    });

    const evenOddRound = await prisma.evenOddRound.findFirst({
      where: { tenantId: user.tenantId, createdById: ownerId, status: "OPEN" }
    });

    if (evenOddRound) {
      const winningSide = sideForNumber(data.firstPrizeNumber);
      await processEvenOddRoundResult(user.tenantId, evenOddRound.id, winningSide, { id: user.id, name: user.name });
    }

    await logActivity(user.id, user.tenantId, `Finished Numbers game ${game.number}`);
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
