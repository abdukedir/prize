export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ensureCsrf, handleError, parseJson } from "@/lib/api";
import { adminRoles, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildReportSummary } from "@/lib/report-summary";

const submitSchema = z.object({
  message: z.string().trim().min(3).max(500).optional()
});

function money(value: unknown) {
  return Number(value ?? 0);
}

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
    numbersGameDeduction: money(approval.numbersGameDeduction),
    evenOddGameDeduction: money(approval.evenOddGameDeduction),
    totalProfit: money(approval.totalProfit),
    reviewedAt: approval.reviewedAt?.toISOString() ?? null,
    createdAt: approval.createdAt.toISOString()
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const approvals = await prisma.reportApproval.findMany({
      where: {
        tenantId: user.tenantId,
        ...(adminRoles.includes(user.role) ? {} : { employeeId: user.id })
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }]
    });
    return NextResponse.json({ approvals: approvals.map(serializeApproval) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser(["EMPLOYEE", "ADMIN", "SUPERADMIN"]);
    const data = await parseJson(req, submitSchema);
    const summary = await buildReportSummary(user.tenantId);
    const defaultMessage = `Please approve report: Numbers games ${summary.numbersGameCount}, Numbers rate ${summary.numbersGameDeduction}, Even/Odd games ${summary.evenOddGameCount}, Even/Odd fee ${summary.evenOddGameDeduction}, total profit ${summary.totalProfit} including Numbers game rate.`;

    const approval = await prisma.reportApproval.create({
      data: {
        tenantId: user.tenantId,
        employeeId: user.id,
        employeeName: user.name,
        message: data.message || defaultMessage,
        numbersGameCount: summary.numbersGameCount,
        numbersGameDeduction: new Prisma.Decimal(summary.numbersGameDeduction),
        evenOddGameCount: summary.evenOddGameCount,
        evenOddGameDeduction: new Prisma.Decimal(summary.evenOddGameDeduction),
        totalProfit: new Prisma.Decimal(summary.totalProfit)
      }
    });

    return NextResponse.json({ approval: serializeApproval(approval) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
