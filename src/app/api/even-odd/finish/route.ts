import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { processEvenOddRoundResult } from "@/lib/games/even-odd";
import { sideForNumber } from "@/lib/games/even-odd";

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    
    const round = await prisma.evenOddRound.findFirst({
      where: { tenantId: user.tenantId, status: "OPEN" },
      orderBy: { number: "desc" }
    });
    
    if (!round) throw new Response("No open Even-Odd round found", { status: 404 });
    
    const rooms = await prisma.evenOddRoom.findMany({
      where: { roundId: round.id },
      include: { bets: true }
    });
    
    const evenTotal = rooms.reduce((sum, room) => 
      sum + room.bets.filter(b => b.side === "EVEN").reduce((s, b) => s + Number(b.amount), 0), 0);
    const oddTotal = rooms.reduce((sum, room) => 
      sum + room.bets.filter(b => b.side === "ODD").reduce((s, b) => s + Number(b.amount), 0), 0);
    
    if (evenTotal !== oddTotal) {
      throw new Response(`Cannot finish: EVEN (${evenTotal}) and ODD (${oddTotal}) are not equal. Remaining: ${Math.abs(evenTotal - oddTotal)}`, { status: 400 });
    }
    
    const selectedNumber = evenTotal > 0 ? 2 : 1;
    const winningSide = sideForNumber(selectedNumber);
    
    await processEvenOddRoundResult(user.tenantId, round.id, selectedNumber, { id: user.id, name: user.name });
    
    await logActivity(user.id, user.tenantId, `Finished Even/Odd game - ${winningSide} wins`);
    return ok({ success: true, winningSide, total: evenTotal });
  } catch (error) {
    return handleError(error);
  }
}