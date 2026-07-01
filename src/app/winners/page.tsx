"use client";

import { useEffect, useState } from "react";
import { Dice5, Medal } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { api, date, money } from "@/lib/client";
import { useI18n } from "@/lib/i18n";

type Participant = { id: string; fullName: string; amountDeposited: number };
type Winner = { id: string; winnerName: string; prizeAmount: number; roundNumber: number; selectedBy: string; createdAt: string };

export default function WinnersPage() {
  const { t } = useI18n();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [participantId, setParticipantId] = useState("");

  function load() {
    api<{ participants: Participant[] }>("/api/participants?pageSize=100").then((data) => setParticipants(data.participants));
    api<{ winners: Winner[] }>("/api/winners").then((data) => setWinners(data.winners));
  }

  useEffect(load, []);

  async function manual() {
    if (!participantId) return toast.error(t("selectParticipantError"));
    await api("/api/winners/manual", { method: "POST", body: JSON.stringify({ participantId }) });
    toast.success(t("manualWinnerSelected"));
    setParticipantId("");
    load();
  }

  async function random() {
    if (!confirm(t("randomWinnerConfirm"))) return;
    await api("/api/winners/random", { method: "POST" });
    toast.success(t("randomWinnerSelected"));
    load();
  }

  return (
    <PageShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("winnerManagement")}</h1>
          <p className="text-sm text-zinc-500">{t("winnerManagementHint")}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="panel p-4">
            <div className="flex items-center gap-3">
              <Medal className="text-mint" size={22} />
              <h2 className="font-semibold">{t("manualWinnerSelection")}</h2>
            </div>
            <select className="mt-4" value={participantId} onChange={(e) => setParticipantId(e.target.value)}>
              <option value="">{t("selectParticipant")}</option>
              {participants.map((participant) => (
                <option key={participant.id} value={participant.id}>{participant.fullName} - {money(participant.amountDeposited)}</option>
              ))}
            </select>
            <button className="btn-primary mt-4" onClick={manual}>{t("selectWinner")}</button>
          </section>
          <section className="panel p-4">
            <div className="flex items-center gap-3">
              <Dice5 className="text-amber" size={22} />
              <h2 className="font-semibold">{t("randomWinnerSelection")}</h2>
            </div>
            <p className="mt-4 text-sm text-zinc-500">{t("randomWinnerHint")}</p>
            <button className="btn-primary mt-4" onClick={random}><Dice5 size={17} />{t("runRandomSelection")}</button>
          </section>
        </div>
        <section className="panel overflow-hidden">
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="font-semibold">{t("winnerHistory")}</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="table-head"><tr><th className="px-4 py-3">{t("winner")}</th><th className="px-4 py-3">{t("prize")}</th><th className="px-4 py-3">{t("round")}</th><th className="px-4 py-3">{t("selectedBy")}</th><th className="px-4 py-3">{t("date")}</th></tr></thead>
            <tbody>
              {winners.map((winner) => (
                <tr key={winner.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3 font-medium">{winner.winnerName}</td>
                  <td className="px-4 py-3">{money(winner.prizeAmount)}</td>
                  <td className="px-4 py-3">{winner.roundNumber}</td>
                  <td className="px-4 py-3">{winner.selectedBy}</td>
                  <td className="px-4 py-3 text-zinc-500">{date(winner.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </PageShell>
  );
}
