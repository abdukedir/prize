import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok, parseJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getOpenNumbersGame, getSettings, serializeEntry } from "@/lib/games/numbers";
import { numberAssignmentSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    const data = await parseJson(req, numberAssignmentSchema);
    const game = await getOpenNumbersGame(user.tenantId);
    const settings = await getSettings(user.tenantId);

    const participant = await prisma.participant.findFirst({ where: { id: data.participantId, tenantId: user.tenantId } });
    if (!participant) throw new Response("Participant not found", { status: 404 });
    if (participant.status === "DISABLED") throw new Response("Disabled participants cannot enter games", { status: 400 });

    const existingNumber = await prisma.entry.findFirst({
      where: { tenantId: user.tenantId, gameId: game.id, selectedNumber: data.selectedNumber }
    });

    if (existingNumber && existingNumber.participantId === data.participantId) {
      await prisma.$transaction([
        prisma.entry.delete({ where: { id: existingNumber.id } }),
        prisma.participant.update({
          where: { id: data.participantId },
          data: { balance: { increment: existingNumber.ticketPrice } }
        })
      ]);
      return ok({ entry: null });
    }

    if (existingNumber) throw new Response("That number is already assigned in this game", { status: 409 });

    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.entry.create({
        data: {
          tenantId: user.tenantId,
          gameId: game.id,
          participantId: data.participantId,
          selectedNumber: data.selectedNumber,
          ticketPrice: settings.ticketPrice
        }
      });

      await tx.participant.update({
        where: { id: data.participantId },
        data: { balance: { decrement: settings.ticketPrice } }
      });

      return created;
    });

    return ok({ entry: serializeEntry(entry) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new Response("That number is already assigned in this game", { status: 409 });
    }
    return handleError(error);
  }
}
