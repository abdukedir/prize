import { NextRequest } from "next/server";
import { ensureCsrf, handleError, ok, parseJson } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { processEvenOddRoundResult, serializeEvenOddRound } from "@/lib/games/even-odd";
import { evenOddPublishResultSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser(["ADMIN", "EMPLOYEE", "SUPERADMIN"]);
    const data = await parseJson(req, evenOddPublishResultSchema);
    const roundId = req.nextUrl.searchParams.get("roundId");
    if (!roundId) throw new Response("Round ID is required", { status: 400 });

    const result = await processEvenOddRoundResult(user.tenantId, roundId, data.selectedNumber, { id: user.id, name: user.name });
    await logActivity(user.id, user.tenantId, `Published Even/Odd result ${data.selectedNumber}`);
    return ok({ round: serializeEvenOddRound(result) });
  } catch (error) {
    return handleError(error);
  }
}
