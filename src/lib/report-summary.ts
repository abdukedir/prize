import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/games/numbers";

export type ReportSummary = {
  numbersGameCount: number;
  numbersGameDeduction: number;
  evenOddGameCount: number;
  evenOddGameDeduction: number;
  totalProfit: number;
};

export async function buildReportSummary(tenantId: string): Promise<ReportSummary> {
  const latestApproved = await prisma.reportApproval.findFirst({
    where: { tenantId, status: "APPROVED", reviewedAt: { not: null } },
    orderBy: { reviewedAt: "desc" },
    select: { reviewedAt: true }
  });
  const resetAfter = latestApproved?.reviewedAt ?? undefined;

  const [settings, numbersReports, evenOddRounds] = await Promise.all([
    getSettings(tenantId),
    prisma.report.findMany({
      where: {
        tenantId,
        gameType: "NUMBERS",
        ...(resetAfter ? { createdAt: { gt: resetAfter } } : {})
      }
    }),
    prisma.evenOddRound.findMany({
      where: {
        tenantId,
        status: "PUBLISHED",
        ...(resetAfter ? { publishedAt: { gt: resetAfter } } : {})
      },
      include: { rooms: true }
    })
  ]);

  const numbersGameCount = numbersReports.reduce((sum, report) => sum + report.gameCount, 0);
  const winnerRate = Number(settings.winnerRate);
  const numbersGameDeduction = numbersGameCount * winnerRate;
  const evenOddGameCount = evenOddRounds.length;
  const evenOddGameDeduction = evenOddRounds.reduce((sum, round) => {
    return sum + round.rooms.reduce((roomSum, room) => roomSum + Number(room.platformFee), 0);
  }, 0);
  const numbersNetIncome = numbersReports.reduce((sum, report) => sum + Number(report.netIncome), 0);

  return {
    numbersGameCount,
    numbersGameDeduction,
    evenOddGameCount,
    evenOddGameDeduction,
    totalProfit: numbersNetIncome + numbersGameDeduction + evenOddGameDeduction
  };
}
