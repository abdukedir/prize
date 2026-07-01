import { prisma } from "@/lib/prisma";
import { serializeMoney } from "@/lib/api";

export async function getTenantStats(tenantId: string) {
  const [participants, employees, users, deposits, settings, recentUsers, recentWinners, currentRound] = await Promise.all([
    prisma.participant.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId, role: "EMPLOYEE" } }),
    prisma.user.count({ where: { tenantId } }),
    prisma.participant.aggregate({
      where: { tenantId },
      _sum: { amountDeposited: true },
      _avg: { amountDeposited: true },
      _max: { amountDeposited: true },
      _min: { amountDeposited: true }
    }),
    prisma.setting.findUnique({ where: { tenantId } }),
    prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, role: true, createdAt: true }
    }),
    prisma.winner.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { participant: true, selectedBy: { select: { name: true } } }
    }),
    prisma.gameRound.findFirst({ where: { tenantId }, orderBy: { number: "desc" } })
  ]);

  const totalDeposits = serializeMoney(deposits._sum.amountDeposited);
  const fee = serializeMoney(settings?.adminFeePercentage ?? 10);
  const winnerPrize = totalDeposits - totalDeposits * (fee / 100);

  return {
    totalParticipants: participants,
    totalUsers: users,
    totalEmployees: employees,
    totalDeposits,
    totalGamePool: totalDeposits,
    adminFeePercentage: fee,
    winnerPrize,
    averageDeposit: serializeMoney(deposits._avg.amountDeposited),
    highestDeposit: serializeMoney(deposits._max.amountDeposited),
    lowestDeposit: serializeMoney(deposits._min.amountDeposited),
    recentUsers,
    recentWinners: recentWinners.map((winner) => ({
      id: winner.id,
      winnerName: winner.participant.fullName,
      prizeAmount: serializeMoney(winner.prizeAmount),
      roundNumber: winner.roundNumber,
      selectedBy: winner.selectedBy.name,
      createdAt: winner.createdAt
    })),
    currentRound
  };
}

export async function getSystemStats() {
  const [participants, employees, users, deposits, recentUsers, recentWinners, tenants] = await Promise.all([
    prisma.participant.count(),
    prisma.user.count({ where: { role: "EMPLOYEE" } }),
    prisma.user.count(),
    prisma.participant.aggregate({
      _sum: { amountDeposited: true },
      _avg: { amountDeposited: true },
      _max: { amountDeposited: true },
      _min: { amountDeposited: true }
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, role: true, createdAt: true }
    }),
    prisma.winner.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { participant: true, selectedBy: { select: { name: true } } }
    }),
    prisma.tenant.count()
  ]);

  const totalDeposits = serializeMoney(deposits._sum.amountDeposited);

  return {
    totalParticipants: participants,
    totalUsers: users,
    totalEmployees: employees,
    totalTenants: tenants,
    totalDeposits,
    totalGamePool: totalDeposits,
    adminFeePercentage: 0,
    winnerPrize: totalDeposits,
    averageDeposit: serializeMoney(deposits._avg.amountDeposited),
    highestDeposit: serializeMoney(deposits._max.amountDeposited),
    lowestDeposit: serializeMoney(deposits._min.amountDeposited),
    recentUsers,
    recentWinners: recentWinners.map((winner) => ({
      id: winner.id,
      winnerName: winner.participant.fullName,
      prizeAmount: serializeMoney(winner.prizeAmount),
      roundNumber: winner.roundNumber,
      selectedBy: winner.selectedBy.name,
      createdAt: winner.createdAt
    })),
    currentRound: null
  };
}

export async function getOpenRound(tenantId: string) {
  const latest = await prisma.gameRound.findFirst({ where: { tenantId }, orderBy: { number: "desc" } });
  if (latest?.status === "OPEN") return latest;
  return prisma.gameRound.create({
    data: { tenantId, number: (latest?.number ?? 0) + 1, status: "OPEN" }
  });
}

export async function calculatePrize(tenantId: string) {
  const stats = await getTenantStats(tenantId);
  return Number(stats.winnerPrize.toFixed(2));
}
