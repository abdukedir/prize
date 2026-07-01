import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok, parseJson } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { asNumber, getOpenNumbersGame, getSettings } from "@/lib/games/numbers";
import { finishNumbersGameSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);

    const user = await requireUser();
    const data = await parseJson(req, finishNumbersGameSchema);
    const settings = await getSettings(user.tenantId);
    const game = await getOpenNumbersGame(user.tenantId);

    const result = await prisma.$transaction(async (tx) => {
      const entries = await tx.entry.findMany({
        where: { tenantId: user.tenantId, gameId: game.id },
        include: { participant: true }
      });

      if (entries.length === 0) {
        throw new Response("Assign at least one number before finishing the game", { status: 400 });
      }

      const firstEntry = entries.find((entry) => entry.selectedNumber === data.firstPrizeNumber);
      const secondEntry = entries.find((entry) => entry.selectedNumber === data.secondPrizeNumber);

      if (!firstEntry || !secondEntry) {
        throw new Response("Both prize numbers must be assigned before finishing the game", { status: 400 });
      }

      const zero = new Prisma.Decimal(0);
      const ticketPrice = new Prisma.Decimal(settings.ticketPrice);
      const employeeRate = new Prisma.Decimal(settings.winnerRate);
      const totalEntries = new Prisma.Decimal(entries.length);

      const totalSales = totalEntries.mul(ticketPrice);
      const firstPrize = totalSales.minus(employeeRate).minus(ticketPrice);
      const secondPrize = ticketPrice;

      const participantIds = new Set<string>();

      for (const entry of entries) {
        participantIds.add(entry.participantId);
      }

      for (const participantId of participantIds) {
        const isFirstWinner = participantId === firstEntry.participantId;
        const isSecondWinner = participantId === secondEntry.participantId;
        let balanceIncrement = zero;

        if (isFirstWinner) {
          balanceIncrement = balanceIncrement.plus(firstPrize);
        }

        if (isSecondWinner) {
          balanceIncrement = balanceIncrement.plus(secondPrize);
        }

        await tx.participant.update({
          where: { id: participantId },
          data: {
            balance: { increment: balanceIncrement },
            status: isFirstWinner || isSecondWinner ? "WINNER" : "LOST"
          }
        });
      }

      await tx.winner.createMany({
        data: [
          {
            tenantId: user.tenantId,
            participantId: firstEntry.participantId,
            prizeAmount: firstPrize,
            rateDeduction: employeeRate,
            prizeRank: "FIRST",
            selectedById: user.id,
            roundId: game.id,
            roundNumber: game.number
          },
          {
            tenantId: user.tenantId,
            participantId: secondEntry.participantId,
            prizeAmount: secondPrize,
            rateDeduction: zero,
            prizeRank: "SECOND",
            selectedById: user.id,
            roundId: game.id,
            roundNumber: game.number
          }
        ]
      });

      const totalPrizePaid = firstPrize.plus(secondPrize);
      const report = await tx.report.create({
        data: {
          tenantId: user.tenantId,
          gameId: game.id,
          gameType: "NUMBERS",
          gameCount: 1,
          participantCount: participantIds.size,
          ticketPrice,
          totalSales,
          firstPrizePaid: firstPrize,
          secondPrizePaid: secondPrize,
          winnerRateDeduction: employeeRate,
          netIncome: totalSales.minus(totalPrizePaid)
        }
      });

      await tx.gameRound.update({
        where: { id: game.id },
        data: { status: "CLOSED", closedAt: new Date() }
      });

      await tx.gameRound.create({
        data: {
          tenantId: user.tenantId,
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
        }
      };
    });

    await logActivity(user.id, user.tenantId, `Finished Numbers game ${game.number}`);
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
