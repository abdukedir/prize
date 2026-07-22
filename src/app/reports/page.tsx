"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Printer, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/auth-guard";
import { api, date, money } from "@/lib/client";
import { useI18n } from "@/lib/i18n";

type PlayerReport = {
  entryId: string;
  gameId: string;
  gameNumber: number;
  participantId: string;
  participantName: string;
  playedNumber: number;
  ticketPrice: number;
  remainingBalance: number;
  result: string;
  reportLine: string;
};

type ReportSummary = {
  numbersGameCount: number;
  numbersGameDeduction: number;
  evenOddGameCount: number;
  evenOddGameDeduction: number;
  totalProfit: number;
};

type Approval = {
  id: string;
  employeeId: string;
  employeeName: string;
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
};

type EmployeeReport = {
  employee: { id: string; name: string; email: string; role: string; disabled: boolean };
  approvals: Approval[];
  latestApproval: { id: string; status: string; createdAt: string } | null;
  pendingCount: number;
  summary: {
    numbersGameCount: number;
    numbersGameDeduction: number;
    evenOddGameCount: number;
    evenOddGameDeduction: number;
    totalProfit: number;
  } | null;
};

export default function ReportsPage() {
  const { user, loading } = useMe();
  const { t } = useI18n();
  const [playerReports, setPlayerReports] = useState<PlayerReport[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [employeeReports, setEmployeeReports] = useState<EmployeeReport[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";

  const loadPlayerReports = useCallback(async (showError = false) => {
    try {
      const data = await api<{ playerReports: PlayerReport[]; summary: ReportSummary }>("/api/reports");
      setPlayerReports(data.playerReports);
      setSummary(data.summary);
    } catch {
      if (showError) toast.error(t("couldNotLoadReports"));
    }
  }, [t]);

  const loadEmployeeReports = useCallback(async () => {
    try {
      const data = await api<{ employees: EmployeeReport[] }>("/api/admin/reports");
      setEmployeeReports(data.employees);
    } catch {
      toast.error(t("couldNotLoadReports"));
    }
  }, [t]);

  useEffect(() => {
    if (isAdmin) {
      loadEmployeeReports();
    } else {
      loadPlayerReports(true);
    }
  }, [isAdmin, loadPlayerReports, loadEmployeeReports]);

  useEffect(() => {
    if (!isAdmin) {
      const interval = window.setInterval(() => {
        if (document.visibilityState === "visible") loadPlayerReports();
      }, 5000);
      return () => window.clearInterval(interval);
    }
  }, [isAdmin, loadPlayerReports]);

  const filteredPlayerReports = useMemo(() => {
    if (!selectedPlayerId) return playerReports;
    return playerReports.filter((report) => report.participantId === selectedPlayerId);
  }, [selectedPlayerId, playerReports]);

  const totalPlayerPages = Math.max(1, Math.ceil(filteredPlayerReports.length / pageSize));
  const paginatedPlayerReports = filteredPlayerReports.slice((page - 1) * pageSize, page * pageSize);

  const playerOptions = useMemo(() => {
    const players = new Map<string, string>();
    for (const report of playerReports) players.set(report.participantId, report.participantName);
    return Array.from(players, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [playerReports]);

  const filteredEmployees = selectedEmployeeId
    ? employeeReports.filter((e) => e.employee.id === selectedEmployeeId)
    : employeeReports;

  const employeeOptions = employeeReports.map((e) => ({ id: e.employee.id, name: e.employee.name }));

  const totalNumbersGames = filteredEmployees.reduce((sum, e) => sum + (e.summary?.numbersGameCount ?? 0), 0);
  const totalEvenOddGames = filteredEmployees.reduce((sum, e) => sum + (e.summary?.evenOddGameCount ?? 0), 0);
  const totalProfit = filteredEmployees.reduce((sum, e) => sum + (e.summary?.totalProfit ?? 0), 0);
  const pendingApprovals = filteredEmployees.reduce((sum, e) => sum + e.pendingCount, 0);

  useEffect(() => {
    setPage(1);
  }, [selectedPlayerId]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPlayerPages));
  }, [totalPlayerPages]);

  if (loading || !user) return <main className="p-6 text-sm text-zinc-500">{t("loading")}</main>;

  return (
    <AppShell user={user}>
      <div className="space-y-5">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{isAdmin ? "Admin Reports" : t("reportClarification")}</p>
            <h1 className="text-3xl font-bold tracking-tight">{t("reports")}</h1>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {isAdmin && (
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
            )}
            {!isAdmin && (
              <>
                <Link className="btn-primary h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm" href="/approvals"><Send size={14} className="sm:size-4" /><span className="hidden sm:inline">{t("beginNewGame")}</span></Link>
                <a className="btn-secondary h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm" href={`/api/reports?format=csv${selectedPlayerId ? `&player=${encodeURIComponent(playerOptions.find((p) => p.id === selectedPlayerId)?.name ?? "")}` : ""}`}><Download size={14} className="sm:size-4" /><span className="hidden sm:inline">CSV</span></a>
                <a className="btn-secondary h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm" href={`/api/reports?format=excel${selectedPlayerId ? `&player=${encodeURIComponent(playerOptions.find((p) => p.id === selectedPlayerId)?.name ?? "")}` : ""}`}><FileSpreadsheet size={14} className="sm:size-4" /><span className="hidden sm:inline">Excel</span></a>
                <a className="btn-secondary h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm" href={`/api/reports?format=pdf${selectedPlayerId ? `&player=${encodeURIComponent(playerOptions.find((p) => p.id === selectedPlayerId)?.name ?? "")}` : ""}`}><Printer size={14} className="sm:size-4" /><span className="hidden sm:inline">PDF</span></a>
              </>
            )}
          </div>
        </div>

        {isAdmin ? (
          <>
            <section className="panel overflow-hidden">
              <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Employee Reports</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="table-head">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Employee</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Numbers Games</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Numbers Rate</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Even-Odd Games</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Even-Odd Fee</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Profit</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Approvals</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filteredEmployees.map((entry) => (
                      <tr key={entry.employee.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer" onClick={() => setExpandedEmployee(expandedEmployee === entry.employee.id ? null : entry.employee.id)}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">{entry.employee.name}</p>
                          <p className="text-[10px] text-zinc-500">{entry.employee.email}</p>
                        </td>
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">{entry.summary?.numbersGameCount ?? 0}</td>
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">{money(entry.summary?.numbersGameDeduction ?? 0, "ETB")}</td>
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">{entry.summary?.evenOddGameCount ?? 0}</td>
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">{money(entry.summary?.evenOddGameDeduction ?? 0, "ETB")}</td>
                        <td className="px-3 py-2 font-bold text-emerald-600">{money(entry.summary?.totalProfit ?? 0, "ETB")}</td>
                        <td className="px-3 py-2">
                          {entry.pendingCount > 0 ? (
                            <span className="rounded-md bg-yellow-100 px-2 py-1 text-[10px] font-bold text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200">
                              {entry.pendingCount} pending
                            </span>
                          ) : (
                            <span className="text-zinc-500">0 pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredEmployees.length === 0 && <p className="px-4 py-8 text-center text-sm text-zinc-500">No employees found</p>}
            </section>

            {expandedEmployee && (
              <section className="panel p-4">
                {(() => {
                  const entry = filteredEmployees.find((e) => e.employee.id === expandedEmployee);
                  if (!entry) return null;
                  return (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{entry.employee.name}</h3>
                          <p className="text-xs text-zinc-500">{entry.employee.email}</p>
                        </div>
                        <button className="btn-secondary !h-7 !px-2 text-xs" onClick={() => setExpandedEmployee(null)}>Close</button>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-4">
                        <div>
                          <p className="text-xs font-medium text-zinc-500">Numbers Games</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{entry.summary?.numbersGameCount ?? 0} games</p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-300">Rate: {money(entry.summary?.numbersGameDeduction ?? 0, "ETB")}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-zinc-500">Even-Odd Games</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{entry.summary?.evenOddGameCount ?? 0} games</p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-300">Fee: {money(entry.summary?.evenOddGameDeduction ?? 0, "ETB")}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-zinc-500">Total Profit</p>
                          <p className="text-sm font-bold text-emerald-600">{money(entry.summary?.totalProfit ?? 0, "ETB")}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-zinc-500">Approvals</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{entry.approvals.length} total</p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-300">{entry.pendingCount} pending</p>
                        </div>
                      </div>
                      {entry.approvals.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Approval History</p>
                          {entry.approvals.map((approval) => (
                            <div key={approval.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${approval.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : approval.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                                  {approval.status}
                                </span>
                                <span className="text-xs text-zinc-500">{new Date(approval.createdAt).toLocaleString()}</span>
                              </div>
                              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{approval.message}</p>
                              <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] sm:text-xs">
                                <p>Numbers: <b>{approval.numbersGameCount}</b> / {money(approval.numbersGameDeduction, "ETB")}</p>
                                <p>Even/Odd: <b>{approval.evenOddGameCount}</b> / {money(approval.evenOddGameDeduction, "ETB")}</p>
                                <p>Profit: <b>{money(approval.totalProfit, "ETB")}</b></p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </section>
            )}
          </>
        ) : (
          <>
            {summary ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="panel p-4">
                  <p className="text-sm font-medium text-zinc-500">Numbers Games</p>
                  <p className="text-2xl font-bold text-emerald-600">{summary.numbersGameCount} games</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Game rate: {money(summary.numbersGameDeduction, "ETB")}</p>
                </div>
                <div className="panel p-4">
                  <p className="text-sm font-medium text-zinc-500">Even-Odd Games</p>
                  <p className="text-2xl font-bold text-emerald-600">{summary.evenOddGameCount} games</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Game rate: {money(summary.evenOddGameDeduction, "ETB")}</p>
                </div>
                <div className="panel p-4">
                  <p className="text-sm font-medium text-zinc-500">Profit</p>
                  <p className="text-2xl font-bold text-emerald-600">{money(summary.totalProfit, "ETB")}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Includes Numbers game rate</p>
                </div>
              </div>
            ) : null}

            <section className="panel p-4">
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Player filter
                <select className="mt-2" value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)}>
                  <option value="">All players</option>
                  {playerOptions.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                </select>
              </label>
            </section>

            <section className="panel divide-y divide-zinc-100 overflow-hidden dark:divide-zinc-800">
              {paginatedPlayerReports.map((report) => (
                <p key={report.entryId} className="px-4 py-3 text-sm font-medium leading-6 text-zinc-800 dark:text-zinc-100">{report.reportLine}</p>
              ))}
              {filteredPlayerReports.length === 0 ? <p className="px-4 py-8 text-center text-sm text-zinc-500">{t("noParticipantsFound")}</p> : null}
            </section>

            {filteredPlayerReports.length > pageSize ? (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <button className="btn-secondary" disabled={page === 1} onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}>{t("previous")}</button>
                <span className="font-medium text-zinc-600 dark:text-zinc-300">{t("page", { page })} / {totalPlayerPages}</span>
                <button className="btn-secondary" disabled={page === totalPlayerPages} onClick={() => setPage((currentPage) => Math.min(totalPlayerPages, currentPage + 1))}>{t("next")}</button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
