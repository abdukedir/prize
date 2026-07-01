import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok, parseJson } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { z } from "zod";

const depositSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0")
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    const { id } = await ctx.params;
    const data = await parseJson(req, depositSchema);

    // Get current participant
    const participant = await prisma.participant.findUnique({
      where: { id, tenantId: user.tenantId }
    });

    if (!participant) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }

    // Update balance (add deposit amount)
    const updated = await prisma.participant.update({
      where: { id, tenantId: user.tenantId },
      data: {
        balance: { increment: data.amount }
      }
    });

    // Log activity
    await logActivity(
      user.id,
      user.tenantId,
      `Added manual deposit of ${data.amount} to participant ${participant.fullName}. Balance: ${participant.balance} → ${updated.balance}`
    );

    return ok({
      participant: {
        ...updated,
        amountDeposited: Number(updated.amountDeposited)
      }
    });
  } catch (error) {
    return handleError(error);
  }
}
