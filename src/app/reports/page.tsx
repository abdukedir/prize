"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/auth-guard";
import { api, money } from "@/lib/client";
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
};

export default function ReportsPage() {
  const { user, loading } = useMe();
  const { t } = useI18n();
  const [playerReports, setPlayerReports] = useState<PlayerReport[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    api<{ playerReports: PlayerReport[]; summary: ReportSummary }>("/api/reports")
      .then((data) => {
        setPlayerReports(data.playerReports);
        setSummary(data.summary);
      })
      .catch(() => toast.error(t("couldNotLoadReports")));
  }, [t]);

  const filteredReports = useMemo(() => {
    if (!selectedPlayerId) return playerReports;
    return playerReports.filter((report) => report.participantId === selectedPlayerId);
  }, [selectedPlayerId, playerReports]);

  const totalPages = Math.max(1, Math.ceil(filteredReports.length / pageSize));
  const paginatedReports = filteredReports.slice((page - 1) * pageSize, page * pageSize);

  const playerOptions = useMemo(() => {
    const players = new Map<string, string>();
    for (const report of playerReports) players.set(report.participantId, report.participantName);
    return Array.from(players, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [playerReports]);

  const selectedPlayerName = playerOptions.find((player) => player.id === selectedPlayerId)?.name ?? "";
  const exportPlayerQuery = selectedPlayerName ? `&player=${encodeURIComponent(selectedPlayerName)}` : "";

  useEffect(() => {
    setPage(1);
  }, [selectedPlayerId]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  if (loading || !user) return <main className="p-6 text-sm text-zinc-500">{t("loading")}</main>;

  return (
    <AppShell user={user}>
      <div className="space-y-5">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{t("reportClarification")}</p>
            <h1 className="text-3xl font-bold tracking-tight">{t("reports")}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="btn-secondary" href={`/api/reports?format=csv${exportPlayerQuery}`}><Download size={16} />CSV</a>
            <a className="btn-secondary" href={`/api/reports?format=excel${exportPlayerQuery}`}><FileSpreadsheet size={16} />Excel</a>
            <a className="btn-secondary" href={`/api/reports?format=pdf${exportPlayerQuery}`}><Printer size={16} />PDF</a>
          </div>
        </div>

        {summary ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="panel p-4">
              <p className="text-sm font-medium text-zinc-500">Numbers Games</p>
              <p className="text-2xl font-bold text-emerald-600">{summary.numbersGameCount} games</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Deduction: {money(summary.numbersGameDeduction, "ETB")}</p>
            </div>
            <div className="panel p-4">
              <p className="text-sm font-medium text-zinc-500">Even-Odd Games</p>
              <p className="text-2xl font-bold text-emerald-600">{summary.evenOddGameCount} games</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Deduction (10%): {money(summary.evenOddGameDeduction, "ETB")}</p>
            </div>
          </div>
        ) : null}

        <section className="panel p-4">
          <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Player filter
            <select
              className="mt-2"
              value={selectedPlayerId}
              onChange={(event) => setSelectedPlayerId(event.target.value)}
            >
              <option value="">All players</option>
              {playerOptions.map((player) => (
                <option key={player.id} value={player.id}>{player.name}</option>
              ))}
            </select>
          </label>
        </section>

        <section className="panel divide-y divide-zinc-100 overflow-hidden dark:divide-zinc-800">
          {paginatedReports.map((report) => (
            <p key={report.entryId} className="px-4 py-3 text-sm font-medium leading-6 text-zinc-800 dark:text-zinc-100">
              {report.reportLine}
            </p>
          ))}
          {filteredReports.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">{t("noParticipantsFound")}</p>
          ) : null}
        </section>

        {filteredReports.length > pageSize ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <button className="btn-secondary" disabled={page === 1} onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}>
              {t("previous")}
            </button>
            <span className="font-medium text-zinc-600 dark:text-zinc-300">
              {t("page", { page })} / {totalPages}
            </span>
            <button className="btn-secondary" disabled={page === totalPages} onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}>
              {t("next")}
            </button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
