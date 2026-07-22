import { NextRequest } from "next/server";
import { ensureCsrf, handleError, ok, parseJson } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { processEvenOddRoundResult, serializeEvenOddRound, sideForNumber } from "@/lib/games/even-odd";
import { evenOddPublishResultSchema } from "@/lib/validators";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser(["ADMIN", "EMPLOYEE", "SUPERADMIN"]);
    const data = await parseJson(req, evenOddPublishResultSchema);
    const roundId = req.nextUrl.searchParams.get("roundId");
    if (!roundId) throw new Response("Round ID is required", { status: 400 });

    const winningSide = sideForNumber(data.selectedNumber);
    
    const settings = await prisma.setting.findFirst({ where: { tenantId: user.tenantId } });
    const houseFeeTiers = (settings?.houseFeeTiers as Array<{ minAmount: number; feePercentage: number }> | null) ?? [];
    const defaultFee = Number(settings?.adminFeePercentage ?? 10);
    const result = await processEvenOddRoundResult(user.tenantId, roundId, winningSide, { id: user.id, name: user.name }, houseFeeTiers, defaultFee);
    await logActivity(user.id, user.tenantId, `Published Even/Odd result ${data.selectedNumber}`);
    return ok({ round: serializeEvenOddRound(result) });
  } catch (error) {
    return handleError(error);
  }
}
