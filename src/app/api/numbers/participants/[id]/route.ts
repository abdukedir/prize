import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, noContent, ok, parseJson } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { serializeParticipant } from "@/lib/games/numbers";
import { participantStatusSchema } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    const existing = await prisma.participant.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
    if (!existing) throw new Response("Participant not found", { status: 404 });
    const data = await parseJson(req, participantStatusSchema);
    const participant = await prisma.$transaction(async (tx) => {
      if (data.status === "DISABLED") {
        const openEntries = await tx.entry.findMany({
          where: {
            tenantId: user.tenantId,
            participantId: params.id,
            game: { status: "OPEN" }
          }
        });
        const refund = openEntries.reduce((sum, entry) => sum.plus(entry.ticketPrice), new Prisma.Decimal(0));

        await tx.entry.deleteMany({
          where: {
            tenantId: user.tenantId,
            participantId: params.id,
            game: { status: "OPEN" }
          }
        });

        return tx.participant.update({
          where: { id: params.id },
          data: {
            status: data.status,
            balance: { increment: refund }
          }
        });
      }

      return tx.participant.update({ where: { id: params.id }, data: { status: data.status } });
    });
    return ok({ participant: serializeParticipant(participant) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    const existing = await prisma.participant.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
    if (!existing) throw new Response("Participant not found", { status: 404 });

    await prisma.$transaction([
      prisma.entry.deleteMany({ where: { tenantId: user.tenantId, participantId: params.id } }),
      prisma.winner.deleteMany({ where: { tenantId: user.tenantId, participantId: params.id } }),
      prisma.evenOddBet.deleteMany({ where: { tenantId: user.tenantId, participantId: params.id } }),
      prisma.participant.delete({ where: { id: params.id } })
    ]);
    await logActivity(user.id, user.tenantId, "Deleted participant");
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
