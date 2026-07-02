import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function asNumber(value: unknown) {
  return Number(value ?? 0);
}

export function serializeSettings(settings: Awaited<ReturnType<typeof getSettings>>) {
  return {
    id: settings.id,
    ticketPrice: asNumber(settings.ticketPrice),
    firstPrize: asNumber(settings.firstPrize),
    secondPrize: asNumber(settings.secondPrize),
    winnerRate: asNumber(settings.winnerRate),
    currency: settings.currency,
    language: settings.language,
    theme: settings.theme,
    adminFeePercentage: asNumber(settings.adminFeePercentage)
  };
}

export async function getSettings(tenantId: string) {
  return prisma.setting.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      adminFeePercentage: new Prisma.Decimal(10),
      ticketPrice: new Prisma.Decimal(200),
      firstPrize: new Prisma.Decimal(1000),
      secondPrize: new Prisma.Decimal(200),
      winnerRate: new Prisma.Decimal(200),
      currency: "ETB",
      language: "en",
      theme: "light"
    }
  });
}

export async function getOpenNumbersGame(tenantId: string) {
  const open = await prisma.gameRound.findFirst({
    where: { tenantId, gameType: "NUMBERS", status: "OPEN" },
    orderBy: { createdAt: "desc" }
  });
  if (open) return open;

  const latest = await prisma.gameRound.findFirst({ where: { tenantId }, orderBy: { number: "desc" } });
  return prisma.gameRound.create({
    data: {
      tenantId,
      number: (latest?.number ?? 0) + 1,
      gameType: "NUMBERS"
    }
  });
}

export function serializeParticipant(participant: {
  id: string;
  fullName: string;
  balance: unknown;
  amountDeposited: unknown;
  status: string;
  createdAt: Date;
}) {
  return {
    id: participant.id,
    name: participant.fullName,
    balance: asNumber(participant.balance),
    amount: asNumber(participant.amountDeposited),
    status: participant.status,
    createdAt: participant.createdAt.toISOString()
  };
}

export function serializeEntry(entry: {
  id: string;
  participantId: string;
  selectedNumber: number;
  ticketPrice: unknown;
}) {
  return {
    id: entry.id,
    participantId: entry.participantId,
    selectedNumber: entry.selectedNumber,
    ticketPrice: asNumber(entry.ticketPrice)
  };
}
