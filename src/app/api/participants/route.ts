import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok, parseJson } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { participantSchema } from "@/lib/validators";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(5, Number(req.nextUrl.searchParams.get("pageSize") ?? 10)));
    const search = req.nextUrl.searchParams.get("search") ?? "";
    const sort = req.nextUrl.searchParams.get("sort") ?? "createdAt";
    const order = req.nextUrl.searchParams.get("order") === "asc" ? "asc" : "desc";
    const where = {
      tenantId: user.tenantId,
      OR: search ? [{ fullName: { contains: search, mode: "insensitive" as const } }, { phoneNumber: { contains: search, mode: "insensitive" as const } }] : undefined
    };
    const [participants, total] = await Promise.all([
      prisma.participant.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.participant.count({ where })
    ]);
    return ok({ participants: participants.map((p) => ({ ...p, amountDeposited: Number(p.amountDeposited) })), total, page, pageSize });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    const data = await parseJson(req, participantSchema);
    const participant = await prisma.participant.create({
      data: { tenantId: user.tenantId, createdById: user.id, ...data }
    });
    await logActivity(user.id, user.tenantId, `Created participant ${participant.fullName}`);
    return ok({ participant: { ...participant, amountDeposited: Number(participant.amountDeposited) } }, 201);
  } catch (error) {
    return handleError(error);
  }
}
