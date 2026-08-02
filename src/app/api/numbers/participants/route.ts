export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok, parseJson } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { ownerIdFromRequestUrl, resolveBoardOwner } from "@/lib/board-owner";
import { getOpenNumbersGame, getSettings, serializeEntry, serializeParticipant, serializeSettings } from "@/lib/games/numbers";
import { bettingParticipantSchema } from "@/lib/validators";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const ownerId = await resolveBoardOwner(user, ownerIdFromRequestUrl(req.url));
    const settings = await getSettings(user.tenantId);
    const game = await getOpenNumbersGame(user.tenantId, ownerId);
    const participants = await prisma.participant.findMany({ where: { tenantId: user.tenantId, createdById: ownerId }, orderBy: { createdAt: "desc" } });
    const entries = await prisma.entry.findMany({ where: { tenantId: user.tenantId, gameId: game.id }, orderBy: { selectedNumber: "asc" } });

    return ok({
      settings: serializeSettings(settings),
      game: { id: game.id, number: game.number, gameType: game.gameType, status: game.status, createdAt: game.createdAt.toISOString() },
      participants: participants.map(serializeParticipant),
      entries: entries.map(serializeEntry)
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    const ownerId = await resolveBoardOwner(user, ownerIdFromRequestUrl(req.url));
    const data = await parseJson(req, bettingParticipantSchema);
    const participant = await prisma.participant.create({
      data: {
        tenantId: user.tenantId,
        fullName: data.name,
        phoneNumber: "",
        amountDeposited: data.amount,
        balance: data.amount,
        status: "ACTIVE",
        createdById: ownerId
      }
    });
    await logActivity(user.id, user.tenantId, `Added participant ${participant.fullName}`);
    return ok({ participant: serializeParticipant(participant) }, 201);
  } catch (error) {
    return handleError(error);
  }
}
