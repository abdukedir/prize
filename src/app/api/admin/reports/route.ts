import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError } from "@/lib/api";
import { adminRoles, requireUser } from "@/lib/auth";
import { buildReportSummary } from "@/lib/report-summary";

function money(value: unknown) {
  return Number(value ?? 0);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(adminRoles);
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");

    const employees = await prisma.user.findMany({
      where: { tenantId: user.tenantId, role: { not: "SUPERADMIN" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, disabled: true }
    });

    const approvals = await prisma.reportApproval.findMany({
      where: { tenantId: user.tenantId, ...(employeeId ? { employeeId } : {}) },
      orderBy: [{ employeeName: "asc" }, { createdAt: "desc" }]
    });

    const grouped = new Map<string, {
      employee: { id: string; name: string; email: string; role: string; disabled: boolean };
      approvals: Array<{
        id: string;
        status: string;
        message: string;
        numbersGameCount: number;
        numbersGameDeduction: number;
        evenOddGameCount: number;
        evenOddGameDeduction: number;
        totalProfit: number;
        reviewedByName: string | null;
        reviewedAt: string | null;
        createdAt: string;
      }>;
      latestApproval: { id: string; status: string; createdAt: string } | null;
      pendingCount: number;
    }>();

    for (const employee of employees) {
      grouped.set(employee.id, {
        employee,
        approvals: [],
        latestApproval: null,
        pendingCount: 0
      });
    }

    for (const approval of approvals) {
      const entry = grouped.get(approval.employeeId);
      if (!entry) continue;

      const serialized = {
        id: approval.id,
        status: approval.status,
        message: approval.message,
        numbersGameCount: approval.numbersGameCount,
        numbersGameDeduction: money(approval.numbersGameDeduction),
        evenOddGameCount: approval.evenOddGameCount,
        evenOddGameDeduction: money(approval.evenOddGameDeduction),
        totalProfit: money(approval.totalProfit),
        reviewedByName: approval.reviewedByName,
        reviewedAt: approval.reviewedAt?.toISOString() ?? null,
        createdAt: approval.createdAt.toISOString()
      };
      entry.approvals.push(serialized);
      if (!entry.latestApproval) entry.latestApproval = { id: approval.id, status: approval.status, createdAt: serialized.createdAt };
      if (approval.status === "PENDING") entry.pendingCount++;
    }

    const result = Array.from(grouped.values()).map((entry) => ({
      ...entry,
      summary: entry.latestApproval
        ? {
            numbersGameCount: entry.approvals[0]?.numbersGameCount ?? 0,
            numbersGameDeduction: entry.approvals[0]?.numbersGameDeduction ?? 0,
            evenOddGameCount: entry.approvals[0]?.evenOddGameCount ?? 0,
            evenOddGameDeduction: entry.approvals[0]?.evenOddGameDeduction ?? 0,
            totalProfit: entry.approvals[0]?.totalProfit ?? 0
          }
        : null
    }));

    return NextResponse.json({ employees: result });
  } catch (error) {
    return handleError(error);
  }
}
