export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { ownerIdFromRequestUrl, resolveBoardOwner } from "@/lib/board-owner";
import { processEvenOddRoundResult } from "@/lib/games/even-odd";

const finishSchema = z.object({
  winningSide: z.enum(["EVEN", "ODD"])
});

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    const ownerId = await resolveBoardOwner(user, ownerIdFromRequestUrl(req.url));

    let data: { winningSide: "EVEN" | "ODD" };
    try {
      const body = await req.json();
      data = finishSchema.parse(body);
    } catch (parseError) {
      console.log("Parse error:", parseError);
      throw new Response("Invalid request body", { status: 400 });
    }

    const round = await prisma.evenOddRound.findFirst({
      where: { tenantId: user.tenantId, createdById: ownerId, status: "OPEN" },
      orderBy: { number: "desc" }
    });

    if (!round) {
      const latest = await prisma.evenOddRound.findFirst({
        where: { tenantId: user.tenantId, createdById: ownerId },
        orderBy: { number: "desc" }
      });
      if (!latest) throw new Response("No Even-Odd round found", { status: 404 });
      throw new Response(`Round already published. Create a new round to finish.`, { status: 400 });
    }

    const rooms = await prisma.evenOddRoom.findMany({
      where: { roundId: round.id, status: { in: ["WAITING", "MATCHED"] } },
      include: { bets: true }
    });

    const evenTotal = rooms.reduce((sum, room) =>
      sum + room.bets.filter(b => b.side === "EVEN").reduce((s, b) => s + Number(b.amount), 0), 0);
    const oddTotal = rooms.reduce((sum, room) =>
      sum + room.bets.filter(b => b.side === "ODD").reduce((s, b) => s + Number(b.amount), 0), 0);

    if (evenTotal === 0 || oddTotal === 0) {
      throw new Response(`Cannot finish: Both EVEN and ODD sides must have bets. EVEN: ${evenTotal}, ODD: ${oddTotal}`, { status: 400 });
    }

    const settings = await prisma.setting.findFirst({ where: { tenantId: user.tenantId } });
    const houseFeeTiers = (settings?.houseFeeTiers as Array<{ minAmount: number; feePercentage: number }> | null) ?? [];
    const defaultFee = Number(settings?.adminFeePercentage ?? 10);
    await processEvenOddRoundResult(user.tenantId, round.id, data.winningSide, { id: user.id, name: user.name }, houseFeeTiers, defaultFee);

    await logActivity(user.id, user.tenantId, `Finished Even/Odd game - ${data.winningSide} wins`);
    return ok({ success: true, winningSide: data.winningSide });
  } catch (error) {
    return handleError(error);
  }
}
