import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError, toCsv } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { asNumber, getSettings } from "@/lib/games/numbers";
import { translateResult } from "@/lib/server-i18n";
import { Language } from "@/lib/i18n";

type MoneyFormatter = (value: number) => string;

type ReportSummary = {
  numbersGameCount: number;
  numbersGameDeduction: number;
  evenOddGameCount: number;
  evenOddGameDeduction: number;
};

async function buildReportSummary(tenantId: string) {
  const [numbersGames, evenOddRooms] = await Promise.all([
    prisma.gameRound.findMany({
      where: { tenantId, gameType: "NUMBERS", status: "CLOSED" }
    }),
    prisma.evenOddRoom.findMany({
      where: { tenantId, status: "COMPLETED" },
      include: { bets: true }
    })
  ]);

  const numbersGameCount = numbersGames.length;
  const numbersGameDeduction = 0;

  const evenOddGameCount = evenOddRooms.length;
  const evenOddGameDeduction = evenOddRooms.reduce((sum, room) => {
    const totalPot = room.bets.reduce((s, bet) => s + Number(bet.amount), 0);
    return sum + totalPot * 0.1;
  }, 0);

  return { numbersGameCount, numbersGameDeduction, evenOddGameCount, evenOddGameDeduction };
}

async function buildPlayerReports(tenantId: string, playerFilter = "", language: Language = "en") {
  const playerWhere = playerFilter
    ? { participant: { fullName: { contains: playerFilter, mode: "insensitive" as const } } }
    : {};
  const [settings, entries, openEntries, evenOddRooms] = await Promise.all([
    getSettings(tenantId),
    prisma.entry.findMany({
      where: {
        tenantId,
        game: { gameType: "NUMBERS", status: "CLOSED" },
        ...playerWhere
      },
      orderBy: [{ game: { number: "desc" } }, { selectedNumber: "asc" }],
      select: {
        id: true,
        selectedNumber: true,
        ticketPrice: true,
        game: {
          select: {
            id: true,
            number: true,
            createdAt: true,
            winners: {
              select: {
                participantId: true,
                prizeRank: true,
                prizeAmount: true
              }
            }
          }
        },
        participant: {
          select: {
            id: true,
            fullName: true,
            balance: true
          }
        }
      }
    }),
    prisma.entry.findMany({
      where: {
        tenantId,
        game: { gameType: "NUMBERS", status: "OPEN" },
        ...playerWhere
      },
      select: {
        participantId: true,
        ticketPrice: true
      }
    }),
    prisma.evenOddRoom.findMany({
      where: { tenantId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      include: {
        bets: {
          where: playerFilter
            ? { participant: { fullName: { contains: playerFilter, mode: "insensitive" as const } } }
            : {},
          include: { participant: { select: { fullName: true, balance: true } } }
        }
      }
    })
  ]);

  const formatMoney: MoneyFormatter = (value) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: settings.currency, maximumFractionDigits: 0 }).format(value ?? 0);

  const openTicketValueByParticipant = new Map<string, number>();
  for (const entry of openEntries) {
    openTicketValueByParticipant.set(
      entry.participantId,
      (openTicketValueByParticipant.get(entry.participantId) ?? 0) + asNumber(entry.ticketPrice)
    );
  }

  const participantGames = new Map<string, Map<string, { gameNumber: number; ticketValue: number; prizeValue: number }>>();
  for (const entry of entries) {
    const games = participantGames.get(entry.participant.id) ?? new Map<string, { gameNumber: number; ticketValue: number; prizeValue: number }>();
    const row = games.get(entry.game.id) ?? { gameNumber: entry.game.number, ticketValue: 0, prizeValue: 0 };
    row.ticketValue += asNumber(entry.ticketPrice);
    row.prizeValue = entry.game.winners
      .filter((winner) => winner.participantId === entry.participant.id)
      .reduce((sum, winner) => sum + asNumber(winner.prizeAmount), 0);
    games.set(entry.game.id, row);
    participantGames.set(entry.participant.id, games);
  }

  const remainingBalanceByParticipantGame = new Map<string, number>();
  const participants = new Map<string, { balance: number }>();
  for (const entry of entries) participants.set(entry.participant.id, { balance: asNumber(entry.participant.balance) });

  for (const [participantId, games] of participantGames) {
    const currentBalance = participants.get(participantId)?.balance ?? 0;
    let runningBalance = currentBalance + (openTicketValueByParticipant.get(participantId) ?? 0);
    const orderedGames = Array.from(games.entries()).sort((a, b) => b[1].gameNumber - a[1].gameNumber);

    for (const [gameId, game] of orderedGames) {
      remainingBalanceByParticipantGame.set(`${participantId}:${gameId}`, runningBalance);
      runningBalance = runningBalance + game.ticketValue - game.prizeValue;
    }
  }

  const numbersReports = entries.map((entry) => {
    const ticketPrice = asNumber(entry.ticketPrice);
    const remainingBalance = remainingBalanceByParticipantGame.get(`${entry.participant.id}:${entry.game.id}`) ?? asNumber(entry.participant.balance);
    const winner = entry.game.winners.find((gameWinner) => gameWinner.participantId === entry.participant.id);
    const resultKey = winner?.prizeRank === "FIRST"
      ? "youWin1stPrize"
      : winner?.prizeRank === "SECOND"
        ? "youWin2ndPrize"
        : "youLoss";
    const resultText = translateResult(language, resultKey);

    return {
      entryId: entry.id,
      gameId: entry.game.id,
      gameNumber: entry.game.number,
      participantId: entry.participant.id,
      participantName: entry.participant.fullName,
      playedNumber: entry.selectedNumber,
      ticketPrice,
      remainingBalance,
      result: resultText,
      reportLine: `${entry.participant.fullName} played number ${entry.selectedNumber} - ticket value ${formatMoney(ticketPrice)} - ${resultText} - remaining balance ${formatMoney(remainingBalance)}.`,
      createdAt: entry.game.createdAt
    };
  });

  const evenOddReports = evenOddRooms.flatMap(room => 
    room.bets.map(bet => {
      const resultKey = bet.payout.gt(0) ? "winner" : "loser";
      const result = translateResult(language, resultKey);
      return {
        entryId: `eo-${bet.id}`,
        gameId: room.id,
        gameNumber: 0,
        participantId: bet.participantId,
        participantName: bet.participant.fullName,
        playedNumber: 0,
        ticketPrice: asNumber(bet.amount),
        remainingBalance: asNumber(bet.participant.balance),
        result,
        reportLine: `${bet.participant.fullName} played ${bet.side} with ${formatMoney(asNumber(bet.amount))} - ${result} - balance ${formatMoney(asNumber(bet.participant.balance))}.`,
        createdAt: room.createdAt
      };
    })
  );

  return [...numbersReports, ...evenOddReports].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const format = req.nextUrl.searchParams.get("format");
    const player = req.nextUrl.searchParams.get("player")?.trim() ?? "";
    const settings = await getSettings(user.tenantId);
    const [summary, playerReports] = await Promise.all([
      buildReportSummary(user.tenantId),
      buildPlayerReports(user.tenantId, player, settings.language as Language)
    ]);

    if (!format) return NextResponse.json({ playerReports, summary });

    const rows = playerReports.map((row) => ({ Report: row.reportLine }));
    const csv = toCsv(rows);
    const isExcel = format === "excel";
    const isPdf = format === "pdf";
    const payload = isExcel
      ? csv.replaceAll(",", "\t")
      : isPdf
        ? `<html><body><h1>Game Report</h1><pre>${csv}</pre><script>window.print()</script></body></html>`
        : csv;

    return new NextResponse(payload, {
      headers: {
        "content-type": `${isPdf ? "text/html" : "text/plain"}; charset=utf-8`,
        "content-disposition": `attachment; filename="game-report.${isPdf ? "html" : isExcel ? "tsv" : "csv"}`
      }
    });
  } catch (error) {
    return handleError(error);
  }
}
