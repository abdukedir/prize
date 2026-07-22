"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/auth-guard";
import { api, date, money } from "@/lib/client";
import { useI18n } from "@/lib/i18n";

type ReportApproval = {
  id: string;
  employeeId: string;
  employeeName: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  message: string;
  numbersGameCount: number;
  numbersGameDeduction: number;
  evenOddGameCount: number;
  evenOddGameDeduction: number;
  totalProfit: number;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export default function ApprovalsPage() {
  const { user, loading } = useMe();
  const { t } = useI18n();
  const [approvals, setApprovals] = useState<ReportApproval[]>([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";

  const loadApprovals = useCallback(async () => {
    const data = await api<{ approvals: ReportApproval[] }>("/api/report-approvals");
    setApprovals(data.approvals);
  }, []);

  const loadLiveData = useCallback(async (showError = false) => {
    try {
      await loadApprovals();
    } catch {
      if (showError) toast.error(t("couldNotLoadReports"));
    }
  }, [loadApprovals, t]);

  useEffect(() => {
    if (!user) return;
    loadLiveData(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadLiveData();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [loadLiveData, user]);

  async function submitApproval() {
    setSubmitting(true);
    try {
      await api("/api/report-approvals", { method: "POST", body: JSON.stringify({ message }) });
      setMessage("");
      await loadLiveData();
      toast.success("Approval message sent to admin");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send approval message");
    } finally {
      setSubmitting(false);
    }
  }

  async function reviewApproval(id: string, status: "APPROVED" | "REJECTED") {
    try {
      await api(`/api/report-approvals/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await loadLiveData();
      toast.success(status === "APPROVED" ? "Report approved" : "Report rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update approval");
    }
  }

  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const approval of approvals) map.set(approval.employeeId, approval.employeeName);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [approvals]);

  const employeeApprovals = useMemo(() => {
    let list = selectedEmployeeId ? approvals.filter((a) => a.employeeId === selectedEmployeeId) : approvals;
    if (statusFilter !== "ALL") {
      list = list.filter((a) => a.status === statusFilter);
    }
    return list;
  }, [selectedEmployeeId, statusFilter, approvals]);

  const employeeSummary = useMemo(() => {
    return employeeApprovals.reduce(
      (acc, a) => ({
        numbersGameCount: acc.numbersGameCount + a.numbersGameCount,
        numbersGameDeduction: acc.numbersGameDeduction + a.numbersGameDeduction,
        evenOddGameCount: acc.evenOddGameCount + a.evenOddGameCount,
        evenOddGameDeduction: acc.evenOddGameDeduction + a.evenOddGameDeduction,
        totalProfit: acc.totalProfit + a.totalProfit
      }),
      { numbersGameCount: 0, numbersGameDeduction: 0, evenOddGameCount: 0, evenOddGameDeduction: 0, totalProfit: 0 }
    );
  }, [employeeApprovals]);

  if (loading || !user) return <main className="p-6 text-sm text-zinc-500">{t("loading")}</main>;

  return (
    <AppShell user={user}>
      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{isAdmin ? "Admin approval" : "Report approval"}</p>
          <h1 className="text-3xl font-bold tracking-tight">Approval</h1>
        </div>

        {!isAdmin ? (
          <section className="panel space-y-3 p-4">
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Send approval message to admin</p>
              <p className="text-xs text-zinc-500">The current profit and game rate summary will be attached automatically.</p>
            </div>
            <textarea className="min-h-24" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write approval note for admin" />
            <button className="btn-primary h-8 px-2.5 text-xs" disabled={submitting} onClick={submitApproval}><Send size={14} className="sm:size-4" /><span className="hidden sm:inline">{t("sendApproval")}</span></button>
          </section>
        ) : (
          <>
            <div className="flex flex-row flex-wrap items-center gap-2">
              <select
                className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
              >
                <option value="">All employees</option>
                {employeeOptions.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
              <select
                className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              >
                <option value="ALL">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="panel p-2 sm:p-4">
                <p className="text-[10px] font-medium text-zinc-500 sm:text-sm">Numbers Games</p>
                <p className="text-sm font-bold text-emerald-600 sm:text-2xl">{employeeSummary.numbersGameCount} games</p>
                <p className="text-[10px] text-zinc-600 dark:text-zinc-300 sm:text-sm">Game rate: {money(employeeSummary.numbersGameDeduction, "ETB")}</p>
              </div>
              <div className="panel p-2 sm:p-4">
                <p className="text-[10px] font-medium text-zinc-500 sm:text-sm">Even-Odd Games</p>
                <p className="text-sm font-bold text-emerald-600 sm:text-2xl">{employeeSummary.evenOddGameCount} games</p>
                <p className="text-[10px] text-zinc-600 dark:text-zinc-300 sm:text-sm">Game rate: {money(employeeSummary.evenOddGameDeduction, "ETB")}</p>
              </div>
              <div className="panel p-2 sm:p-4">
                <p className="text-[10px] font-medium text-zinc-500 sm:text-sm">Profit</p>
                <p className="text-sm font-bold text-emerald-600 sm:text-2xl">{money(employeeSummary.totalProfit, "ETB")}</p>
                <p className="text-[10px] text-zinc-600 dark:text-zinc-300 sm:text-sm">Includes Numbers game rate</p>
              </div>
            </div>

            <section className="panel divide-y divide-zinc-100 overflow-hidden dark:divide-zinc-800">
              {employeeApprovals.map((approval) => (
                <div key={approval.id} className="space-y-3 p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{approval.employeeName}</p>
                      <p className="text-xs text-zinc-500">{date(approval.createdAt)}</p>
                    </div>
                    <span className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-bold ${approval.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : approval.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {approval.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-6 text-zinc-800 dark:text-zinc-100">{approval.message}</p>
                  <div className="grid grid-cols-3 gap-2 text-[10px] sm:text-sm">
                    <p className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-900 sm:p-3">Numbers: <b>{approval.numbersGameCount}</b> / {money(approval.numbersGameDeduction, "ETB")}</p>
                    <p className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-900 sm:p-3">Even/Odd: <b>{approval.evenOddGameCount}</b> / {money(approval.evenOddGameDeduction, "ETB")}</p>
                    <p className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-900 sm:p-3">Profit: <b>{money(approval.totalProfit, "ETB")}</b></p>
                  </div>
                  {approval.status === "PENDING" ? (
                    <div className="flex flex-wrap gap-1.5">
                      <button className="btn-primary h-7 px-2 text-[10px] sm:h-8 sm:px-3 sm:text-xs" onClick={() => reviewApproval(approval.id, "APPROVED")}><CheckCircle2 size={14} className="sm:size-4" /><span className="hidden sm:inline">{t("approve")}</span></button>
                      <button className="btn-danger h-7 px-2 text-[10px] sm:h-8 sm:px-3 sm:text-xs" onClick={() => reviewApproval(approval.id, "REJECTED")}><XCircle size={14} className="sm:size-4" /><span className="hidden sm:inline">{t("reject")}</span></button>
                    </div>
                  ) : (
                    <p className="text-[10px] sm:text-xs text-zinc-500">Reviewed by {approval.reviewedByName ?? "admin"}{approval.reviewedAt ? ` on ${date(approval.reviewedAt)}` : ""}</p>
                  )}
                </div>
              ))}
              {employeeApprovals.length === 0 && <p className="px-4 py-8 text-center text-sm text-zinc-500">No approvals found for this employee.</p>}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
