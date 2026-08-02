export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureCsrf, handleError, parseJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const reviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"])
});

function serializeApproval(approval: {
  id: string;
  employeeId: string;
  employeeName: string;
  status: string;
  message: string;
  numbersGameCount: number;
  numbersGameDeduction: unknown;
  evenOddGameCount: number;
  evenOddGameDeduction: unknown;
  totalProfit: unknown;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}) {
  return {
    ...approval,
    numbersGameDeduction: Number(approval.numbersGameDeduction ?? 0),
    evenOddGameDeduction: Number(approval.evenOddGameDeduction ?? 0),
    totalProfit: Number(approval.totalProfit ?? 0),
    reviewedAt: approval.reviewedAt?.toISOString() ?? null,
    createdAt: approval.createdAt.toISOString()
  };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    ensureCsrf(req);
    const user = await requireUser(["ADMIN", "SUPERADMIN"]);
    const data = await parseJson(req, reviewSchema);
    const approval = await prisma.reportApproval.update({
      where: { id: params.id, tenantId: user.tenantId },
      data: {
        status: data.status,
        reviewedById: user.id,
        reviewedByName: user.name,
        reviewedAt: new Date()
      }
    });
    return NextResponse.json({ approval: serializeApproval(approval) });
  } catch (error) {
    return handleError(error);
  }
}
