"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Medal, Play, Plus, RefreshCw, Trash2, Trophy, UserCheck, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/auth-guard";
import { api, money } from "@/lib/client";
import { statusKey, useI18n } from "@/lib/i18n";
import { bettingParticipantSchema } from "@/lib/validators";

type Side = "EVEN" | "ODD";

type Settings = {
  ticketPrice: number;
  firstPrize: number;
  secondPrize: number;
  winnerRate: number;
  currency: string;
};

type Participant = {
  id: string;
  name: string;
  balance: number;
  amount: number;
  status: "ACTIVE" | "WINNER" | "LOST" | "DISABLED";
};

type Entry = {
  id: string;
  participantId: string;
  selectedNumber: number;
  ticketPrice: number;
};

type NumbersState = {
  settings: Settings;
  game: { id: string; number: number; status: string };
  participants: Participant[];
  entries: Entry[];
};

type FormData = z.infer<typeof bettingParticipantSchema>;
type PendingAction =
  | { type: "removeNumber"; participant: Participant; selectedNumber: number; ticketPrice: number }
  | { type: "deactivate"; participant: Participant; selectedNumbers: number[] }
  | { type: "delete"; participant: Participant; selectedNumbers: number[] };

export default function NumbersGamePage() {
  const { user, loading } = useMe();
  const { t } = useI18n();
  const [state, setState] = useState<NumbersState | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [showWinnerSelection, setShowWinnerSelection] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showZeroBalance, setShowZeroBalance] = useState<Participant | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [firstPrizeNumber, setFirstPrizeNumber] = useState<number | null>(null);
  const [secondPrizeNumber, setSecondPrizeNumber] = useState<number | null>(null);
const [bothGameMode, setBothGameMode] = useState(false);

  const [bothGameAmount, setBothGameAmount] = useState(500);

  const [showBothModal, setShowBothModal] = useState(false);

  const [selectedParticipantForBoth, setSelectedParticipantForBoth] = useState<Participant | null>(null);

  const [pendingNumber, setPendingNumber] = useState<number | null>(null);

  const [pendingBet, setPendingBet] = useState<{ participant: Participant; amount: number; side: Side } | null>(null);
  const form = useForm<FormData>({ resolver: zodResolver(bettingParticipantSchema), defaultValues: { name: "", amount: 200 } });

  async function load() {
    const data = await api<NumbersState>("/api/numbers/participants");
    setState(data);
    form.setValue("amount", data.settings.ticketPrice);
  }

  useEffect(() => {
    load().catch((error) => toast.error(error instanceof Error ? error.message : t("couldNotLoadGame")));
  }, [t]);

  const activeParticipants = state?.participants.filter((participant) => participant.status !== "DISABLED") ?? [];
  const numberOptions = useMemo(() => Array.from({ length: Math.max(activeParticipants.length, 1) }, (_, index) => index + 1), [activeParticipants.length]);
  const numberGridStyle = useMemo(() => ({ gridTemplateColumns: `repeat(${numberOptions.length}, minmax(24px, 1fr))` }), [numberOptions.length]);
  const assignedByParticipant = useMemo(() => {
    const grouped = new Map<string, number[]>();
    for (const entry of state?.entries ?? []) grouped.set(entry.participantId, [...(grouped.get(entry.participantId) ?? []), entry.selectedNumber]);
    return grouped;
  }, [state]);
  const participantIdByNumber = useMemo(() => new Map(state?.entries.map((entry) => [entry.selectedNumber, entry.participantId]) ?? []), [state]);
  const assignedNumbers = useMemo(() => new Set(state?.entries.map((entry) => entry.selectedNumber) ?? []), [state]);
  const entryByParticipantAndNumber = useMemo(() => {
    const entries = new Map<string, Entry>();
    for (const entry of state?.entries ?? []) entries.set(`${entry.participantId}:${entry.selectedNumber}`, entry);
    return entries;
  }, [state]);
  const prizePreview = useMemo(() => {
    const ticketPrice = state?.settings.ticketPrice ?? 0;
    const winnerRate = state?.settings.winnerRate ?? 0;
    const totalSales = (state?.entries.length ?? 0) * ticketPrice;

    return {
      firstPrize: totalSales - winnerRate - ticketPrice,
      secondPrize: ticketPrice
    };
  }, [state]);

  async function addParticipant(values: FormData) {
    try {
      setBusy(true);
      await api("/api/numbers/participants", { method: "POST", body: JSON.stringify(values) });
      form.reset({ name: "", amount: state?.settings.ticketPrice ?? 200 });
      setShowRegistration(false);
      await load();
      toast.success(t("participantAdded"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("couldNotAddParticipant"));
    } finally {
      setBusy(false);
    }
  }

async function assign(participant: Participant, selectedNumber: number) {
    const existingEntry = entryByParticipantAndNumber.get(`${participant.id}:${selectedNumber}`);
    if (existingEntry) {
      setPendingAction({ type: "removeNumber", participant, selectedNumber, ticketPrice: existingEntry.ticketPrice });
      return;
    }

    if (bothGameMode) {
      setPendingNumber(selectedNumber);
      setSelectedParticipantForBoth(participant);
      setShowBothModal(true);
      return;
    }

    await saveAssignment(participant.id, selectedNumber);
  }

  async function confirmBothGame() {
    if (!selectedParticipantForBoth || pendingNumber === null) return;
    setShowBothModal(false);
    
    try {
      setBusy(true);
      const side = pendingNumber % 2 === 0 ? "EVEN" : "ODD";
      await api("/api/even-odd", { method: "POST", body: JSON.stringify({ participantId: selectedParticipantForBoth.id, side, amount: bothGameAmount }) });
      await saveAssignment(selectedParticipantForBoth.id, pendingNumber);
      toast.success(t("participantAdded"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("couldNotAssignNumber"));
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment(participantId: string, selectedNumber: number) {
    try {
      await api("/api/numbers/assign", { method: "POST", body: JSON.stringify({ participantId, selectedNumber }) });
      await load();
      toast.success(t("participantAdded"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("couldNotAssignNumber"));
    }
  }

  async function updateStatus(participant: Participant, status: Participant["status"]) {
    const selectedNumbers = assignedByParticipant.get(participant.id) ?? [];
    if (status === "DISABLED" && selectedNumbers.length > 0) {
      setPendingAction({ type: "deactivate", participant, selectedNumbers });
      return;
    }

    await saveStatus(participant.id, status);
  }

  async function saveStatus(participantId: string, status: Participant["status"]) {
    try {
      await api(`/api/numbers/participants/${participantId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
      toast.success(status === "DISABLED" ? t("participantDeactivated") : t("participantActivated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("couldNotUpdateParticipant"));
    }
  }

  async function deleteParticipant(participant: Participant) {
    const selectedNumbers = assignedByParticipant.get(participant.id) ?? [];
    setPendingAction({ type: "delete", participant, selectedNumbers });
  }

  async function saveDelete(participantId: string) {
    try {
      await api(`/api/numbers/participants/${participantId}`, { method: "DELETE" });
      await load();
      toast.success(t("participantRemoved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("couldNotRemoveParticipant"));
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);

    if (action.type === "removeNumber") {
      await saveAssignment(action.participant.id, action.selectedNumber);
    } else if (action.type === "deactivate") {
      await saveStatus(action.participant.id, "DISABLED");
    } else {
      await saveDelete(action.participant.id);
    }
  }

  async function finishGame() {
    if (!state || firstPrizeNumber === null || secondPrizeNumber === null) return;
    setShowFinishConfirm(true);
  }

  async function confirmFinishGame() {
    if (!state || firstPrizeNumber === null || secondPrizeNumber === null) return;
    setShowFinishConfirm(false);
    
    try {
      setBusy(true);
      await api("/api/numbers/finish", { method: "POST", body: JSON.stringify({ firstPrizeNumber, secondPrizeNumber }) });
      setFirstPrizeNumber(null);
      setSecondPrizeNumber(null);
      setBothGameMode(false);
      await load();
      toast.success(t("gameFinished"));
      setShowWinnerSelection(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("couldNotFinishGame"));
    } finally {
      setBusy(false);
    }
  }

  async function addDeposit() {
    if (!selectedParticipant || !depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error(t("enterValidAmount"));
      return;
    }

    try {
      setBusy(true);
      await api(`/api/participants/${selectedParticipant.id}/deposit`, {
        method: "POST",
        body: JSON.stringify({ amount: parseFloat(depositAmount) })
      });
      await load();
      toast.success(t("depositAdded", { amount: money(parseFloat(depositAmount)), name: selectedParticipant.name }));
      setShowDeposit(false);
      setDepositAmount("");
      setSelectedParticipant(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("couldNotAddDeposit"));
    } finally {
      setBusy(false);
    }
  }

  function openDepositModal(participant: Participant) {
    setSelectedParticipant(participant);
    setDepositAmount("");
    setShowDeposit(true);
  }

  function checkZeroBalance(participant: Participant) {
    if (participant.balance <= 0) {
      setShowZeroBalance(participant);
    }
  }

  if (loading || !user) return <main className="p-6 text-sm text-zinc-500">{t("loading")}</main>;
  if (!state) return <AppShell user={user}><div className="text-sm text-zinc-500">{t("loadingNumbersGame")}</div></AppShell>;

  const firstPrizeParticipantId = firstPrizeNumber === null ? undefined : participantIdByNumber.get(firstPrizeNumber);
  const secondPrizeParticipantId = secondPrizeNumber === null ? undefined : participantIdByNumber.get(secondPrizeNumber);
  const firstPrizeWinner = state.participants.find((participant) => participant.id === firstPrizeParticipantId);
  const secondPrizeWinner = state.participants.find((participant) => participant.id === secondPrizeParticipantId);

  const pendingTitle = pendingAction?.type === "removeNumber"
    ? t("removeSelectedNumber")
    : pendingAction?.type === "deactivate"
      ? t("deactivateParticipantQuestion")
      : t("removeParticipantQuestion");
  const pendingDescription = pendingAction?.type === "removeNumber"
    ? t("removeNumberDescription", { name: pendingAction.participant.name, number: pendingAction.selectedNumber, amount: money(pendingAction.ticketPrice, state.settings.currency) })
    : pendingAction?.type === "deactivate"
      ? t("deactivateDescription", { name: pendingAction.participant.name, numbers: pendingAction.selectedNumbers.join(", ") })
      : pendingAction
        ? pendingAction.selectedNumbers.length > 0
          ? t("deleteWithNumbersDescription", { name: pendingAction.participant.name, numbers: pendingAction.selectedNumbers.join(", ") })
          : t("deleteDescription", { name: pendingAction.participant.name })
        : "";
  const pendingConfirmLabel = pendingAction?.type === "removeNumber"
    ? t("removeNumber")
    : pendingAction?.type === "deactivate"
      ? t("deactivateAndRefund")
      : t("removeParticipant");
  const pendingCancelLabel = pendingAction?.type === "removeNumber" ? t("keepNumberActive") : t("cancel");

  return (
    <AppShell user={user}>
      <div className="space-y-2">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <p className="text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400">{t("numbersGame", { number: state.game.number })}</p>
            <button className={`h-7 px-2 text-[11px] rounded font-semibold transition ${bothGameMode ? "bg-purple-500 text-white" : "border border-zinc-200 bg-white hover:bg-purple-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"}`} onClick={() => setBothGameMode(!bothGameMode)}>
              {bothGameMode ? "Both ON" : "Both"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary h-8 px-2 sm:!px-3 text-[11px] sm:text-xs flex-1 sm:flex-initial" onClick={() => setShowRegistration(true)}><Plus size={14} /><span className="hidden sm:inline">{t("addParticipant")}</span></button>
            <button className="btn-primary h-8 px-2 sm:!px-3 text-[11px] sm:text-xs flex-1 sm:flex-initial" onClick={() => setShowWinnerSelection(true)}><Trophy size={14} /><span className="hidden sm:inline">{t("selectWinners")}</span></button>
            <button className="btn-secondary h-8 px-2 sm:!px-3 text-[11px] sm:text-xs" onClick={load}><RefreshCw size={14} /><span className="hidden sm:inline">{t("refresh")}</span></button>
          </div>
        </div>

        <section className="grid items-stretch gap-2 grid-cols-1 lg:grid-cols-2">
          <div className="panel flex h-full flex-col gap-1 p-2 min-h-[300px]">
            {activeParticipants.map((participant) => {
              const selectedNumbers = assignedByParticipant.get(participant.id) ?? [];
              return (
                <div key={participant.id} className="grid grid-cols-[minmax(80px,max-content)_1fr] items-center gap-2 rounded border border-zinc-100 px-2 py-1 dark:border-zinc-800">
                  <div className="min-w-0">
                    <h3 className="min-w-0 truncate text-xs font-semibold">{participant.name}</h3>
                  </div>
                  <div className="grid w-full gap-0.5" style={numberGridStyle}>
                    {numberOptions.map((number) => {
                      const selected = selectedNumbers.includes(number);
                      const taken = assignedNumbers.has(number) && !selected;
                      const side = bothGameMode ? (number % 2 === 0 ? "E" : "O") : null;
                      return (
                        <button
                          key={number}
                          className={`h-5 rounded text-[11px] font-bold relative ${selected ? "bg-emerald-500 text-white" : taken ? "bg-zinc-100 text-zinc-400 dark:bg-zinc-800" : "border border-zinc-200 hover:bg-emerald-50 dark:border-zinc-800 dark:hover:bg-zinc-800"}`}
                          disabled={taken}
                          onClick={() => assign(participant, number)}
                        >
                          <span className="flex items-center justify-center gap-1">
                            {number}
                            {side && <span className="text-[8px] opacity-70">({side})</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="panel flex h-full flex-col p-2 text-[10px] min-h-[300px] overflow-auto">
            <div className="mt-2 overflow-hidden rounded border border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/40">
              <div className="overflow-x-auto text-[9px] sm:text-[10px]">
                <table className="w-full text-[8px] sm:text-[9px] md:text-[10px]">
                  <thead className="table-head">
                    <tr>
                      <th className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-[7px] sm:text-[9px] whitespace-nowrap">{t("name")}</th>
                      <th className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-[7px] sm:text-[9px] whitespace-nowrap">{t("selectedColumn")}</th>
                      <th className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-[7px] sm:text-[9px] whitespace-nowrap">{t("balance")}</th>
                      <th className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-[7px] sm:text-[9px] whitespace-nowrap">{t("status")}</th>
                      <th className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-[7px] sm:text-[9px] whitespace-nowrap">{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {state.participants.map((participant) => {
                      const selectedNumbers = assignedByParticipant.get(participant.id) ?? [];
                      return (
                        <tr key={participant.id}>
                          <td className="px-1.5 sm:px-3 py-1 sm:py-2 font-medium text-[7px] sm:text-[9px] md:text-[10px]">{participant.name}</td>
                          <td className="px-1.5 sm:px-3 py-1 sm:py-2">
                            <div className="flex flex-wrap gap-0.5 sm:gap-1">
                              {selectedNumbers.length > 0 ? selectedNumbers.map((number) => (
                                <span key={number} className="rounded bg-emerald-50 px-1 sm:px-2 py-0.5 text-[6px] sm:text-[8px] md:text-[9px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{number}</span>
                              )) : <span className="text-zinc-400 text-[6px] sm:text-[8px]">-</span>}
                            </div>
                          </td>
                          <td className="px-1.5 sm:px-3 py-1 sm:py-2 text-[7px] sm:text-[9px] md:text-[10px]">{money(participant.balance, state.settings.currency)}</td>
                          <td className="px-1.5 sm:px-3 py-1 sm:py-2">
                            <span className={`rounded px-1 sm:px-2 py-0.5 text-[6px] sm:text-[8px] md:text-[9px] font-bold ${participant.status === "DISABLED" ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}`}>
                              {t(statusKey(participant.status))}
                            </span>
                          </td>
                          <td className="px-1.5 sm:px-3 py-1 sm:py-2">
                            <div className="flex flex-wrap gap-0.5 sm:gap-1">
                              {participant.status === "DISABLED" ? (
                                <button className="btn-secondary h-5 sm:h-7 !px-1 sm:!px-2 text-[6px] sm:text-[8px] md:text-[9px]" onClick={() => updateStatus(participant, "ACTIVE")} title={t("activateParticipant")}><UserCheck size={10} /><span className="hidden sm:inline">{t("activate")}</span></button>
                              ) : (
                                <button className="btn-secondary h-5 sm:h-7 !px-1 sm:!px-2 text-[6px] sm:text-[8px] md:text-[9px]" onClick={() => updateStatus(participant, "DISABLED")} title={t("deactivateParticipant")}><UserX size={10} /><span className="hidden sm:inline">{t("deactivate")}</span></button>
                              )}
                              <button className={`h-5 sm:h-7 !px-1 sm:!px-2 text-[6px] sm:text-[8px] md:text-[9px] flex items-center gap-1 ${participant.balance <= 0 ? "btn-primary" : "btn-secondary"}`} onClick={() => openDepositModal(participant)} title={t("addFunds")}><Plus size={10} /><span className="hidden md:inline">{t("deposit")}</span></button>
                              <button className="btn-danger h-5 sm:h-7 !px-1 sm:!px-2 text-[6px] sm:text-[8px] md:text-[9px]" onClick={() => deleteParticipant(participant)} title={t("removePermanently")}><Trash2 size={10} /><span className="hidden sm:inline">{t("remove")}</span></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </section>

      </div>
      {pendingAction ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div className="panel w-full max-w-[420px] overflow-hidden shadow-xl">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{t("confirmAction")}</p>
              <h2 className="mt-1 text-lg font-bold">{pendingTitle}</h2>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{pendingDescription}</p>
              {pendingAction.type !== "delete" || pendingAction.selectedNumbers.length > 0 ? (
                <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-xs font-semibold text-zinc-500">{t("selectedNumbers")}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(pendingAction.type === "removeNumber" ? [pendingAction.selectedNumber] : pendingAction.selectedNumbers).map((number) => (
                      <span key={number} className="rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{number}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <button className="btn-secondary h-8 !px-3 text-xs" onClick={() => setPendingAction(null)}>{pendingCancelLabel}</button>
              <button className={pendingAction.type === "delete" ? "btn-danger h-8 !px-3 text-xs" : "btn-primary h-8 !px-3 text-xs"} onClick={confirmPendingAction}>
                {pendingConfirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showWinnerSelection ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div className="panel w-full max-w-[520px] overflow-hidden shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{t("winnerSelection")}</p>
                <h2 className="mt-1 text-sm font-bold">{t("chooseWinningNumbers")}</h2>
              </div>
              <button type="button" className="btn-secondary !h-7 !px-2 text-[10px]" onClick={() => setShowWinnerSelection(false)}><X size={14} /></button>
            </div>
            <div className="space-y-3 p-4 text-[10px]">
              <p className="text-zinc-500">{t("winnerSelectionHint")}</p>
              <div className="grid gap-2">
                <div className="grid grid-cols-[minmax(110px,0.45fr)_1fr] items-center overflow-hidden rounded border border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
                  <div className="flex items-center gap-2 border-l-2 border-amber-400 px-2 py-1.5">
                    <Medal size={18} className="text-amber-500" />
                    <div>
                      <p className="text-[11px] font-bold">{t("firstPrize")}</p>
                      <p className="text-[9px] text-zinc-500">{t("pickOneNumber")}</p>
                    </div>
                  </div>
                  <div className="grid w-full gap-0.5" style={numberGridStyle}>
                    {numberOptions.map((number) => {
                      const participantId = participantIdByNumber.get(number);
                      const disabled = !participantId || number === secondPrizeNumber;
                      return (
                        <button
                          key={`first-${number}`}
                          className={`h-7 rounded text-[11px] font-bold ${firstPrizeNumber === number ? "bg-amber-400 text-black" : disabled ? "bg-zinc-100 text-zinc-400 dark:bg-zinc-800" : "border border-zinc-200 bg-white hover:bg-amber-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"}`}
                          disabled={disabled}
                          onClick={() => participantId && setFirstPrizeNumber(number)}
                        >
                          {number}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-[minmax(110px,0.45fr)_1fr] items-center overflow-hidden rounded border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="flex items-center gap-2 border-l-2 border-slate-400 px-2 py-1.5">
                    <Medal size={18} className="text-slate-500" />
                    <div>
                      <p className="text-[11px] font-bold">{t("secondPrize")}</p>
                      <p className="text-[9px] text-zinc-500">{t("pickOneNumber")}</p>
                    </div>
                  </div>
                  <div className="grid w-full gap-0.5" style={numberGridStyle}>
                    {numberOptions.map((number) => {
                      const participantId = participantIdByNumber.get(number);
                      const disabled = !participantId || number === firstPrizeNumber;
                      return (
                        <button
                          key={`second-${number}`}
                          className={`h-7 rounded text-[11px] font-bold ${secondPrizeNumber === number ? "bg-slate-600 text-white" : disabled ? "bg-zinc-100 text-zinc-400 dark:bg-zinc-800" : "border border-zinc-200 bg-white hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"}`}
                          disabled={disabled}
                          onClick={() => participantId && setSecondPrizeNumber(number)}
                        >
                          {number}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] text-zinc-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-zinc-200">
                <span>{t("firstPrize")}: <b className="text-emerald-600">{firstPrizeNumber ?? "-"}</b></span>
                <span className="text-zinc-400">|</span>
                <span>{t("secondPrize")}: <b className="text-emerald-600">{secondPrizeNumber ?? "-"}</b></span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <button className="btn-secondary h-8 !px-3 text-xs" type="button" onClick={() => setShowWinnerSelection(false)}>{t("close")}</button>
              <button className={`h-8 !px-4 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center gap-2 ${busy ? "bg-emerald-500 text-white shadow-lg scale-105" : firstPrizeNumber === null || secondPrizeNumber === null ? "bg-zinc-200 text-zinc-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600" : "btn-primary hover:shadow-lg hover:scale-105 active:scale-95"}`} type="button" disabled={busy || firstPrizeNumber === null || secondPrizeNumber === null} onClick={finishGame}>
                {busy ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    {t("processing")}
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    {t("finishGame")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showFinishConfirm && state ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="panel w-full max-w-[480px] overflow-hidden shadow-2xl">
            <div className="border-b border-zinc-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-4 dark:border-zinc-800 dark:from-emerald-950/40 dark:to-teal-950/40">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 p-3">
                  <CheckCircle2 size={24} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{t("gameCompletion")}</p>
                  <h2 className="mt-1 text-lg font-bold text-zinc-900 dark:text-white">{t("confirmGameFinish")}</h2>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-6 text-[10px]">
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{t("finishWarning")}</p>
              
              <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">{t("firstPrizeWinner")}</p>
                    <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white">{firstPrizeWinner?.name ?? t("unknownParticipant")}</p>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{t("numberLabel")} <span className="font-bold"># {firstPrizeNumber}</span></p>
                  </div>
                  <div className="rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 px-4 py-2 text-center">
                    <p className="text-xs font-semibold text-black">{t("prize")}</p>
                    <p className="mt-1 text-sm font-bold text-black">{money(prizePreview.firstPrize, state.settings.currency)}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">{t("secondPrizeWinner")}</p>
                    <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white">{secondPrizeWinner?.name ?? t("unknownParticipant")}</p>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{t("numberLabel")} <span className="font-bold"># {secondPrizeNumber}</span></p>
                  </div>
                  <div className="rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 px-4 py-2 text-center">
                    <p className="text-xs font-semibold text-white">{t("prize")}</p>
                    <p className="mt-1 text-sm font-bold text-white">{money(prizePreview.secondPrize, state.settings.currency)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300">{t("winnerRateDeduction")}</p>
                <p className="mt-1 text-sm font-bold text-red-700 dark:text-red-300">{money(state.settings.winnerRate, state.settings.currency)}</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50/50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950/30 sm:flex-row sm:justify-end">
              <button className="btn-secondary h-10 flex-1 sm:flex-initial text-sm font-semibold" type="button" onClick={() => setShowFinishConfirm(false)}>{t("cancel")}</button>
              <button className={`h-10 flex-1 sm:flex-initial text-sm font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${busy ? "bg-emerald-500 text-white shadow-lg" : "btn-primary hover:shadow-lg hover:scale-105 active:scale-95"}`} type="button" disabled={busy} onClick={confirmFinishGame}>
                {busy ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    {t("processing")}
                  </>
                ) : (
                  <>
                    <Trophy size={18} />
                    {t("confirmAwardPrizes")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showZeroBalance ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="panel w-full max-w-[420px] overflow-hidden shadow-xl">
            <div className="border-b border-zinc-200 bg-red-50 px-4 py-3 dark:border-zinc-800 dark:bg-red-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">{t("balanceAlert")}</p>
              <h2 className="mt-1 text-lg font-bold text-zinc-900 dark:text-white">{t("balanceZero", { name: showZeroBalance.name })}</h2>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{t("zeroBalanceQuestion", { name: showZeroBalance.name })}</p>
              <div className="rounded-lg bg-yellow-50 px-3 py-2 dark:bg-yellow-950/30">
                <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">{t("currentBalance")}: <span className="font-bold">{money(showZeroBalance.balance, state?.settings.currency)}</span></p>
              </div>
            </div>
            <div className="flex gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <button className="btn-secondary flex-1 h-10 text-sm font-semibold" onClick={() => setShowZeroBalance(null)}>{t("allowPlayNegative")}</button>
              <button className="btn-primary flex-1 h-10 text-sm font-semibold" onClick={() => { openDepositModal(showZeroBalance); setShowZeroBalance(null); }}>{t("addFunds")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {showDeposit && selectedParticipant && state ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="panel w-full max-w-[380px] overflow-hidden shadow-xl">
            <div className="border-b border-zinc-200 bg-emerald-50 px-4 py-3 dark:border-zinc-800 dark:bg-emerald-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{t("addDeposit")}</p>
              <h2 className="mt-1 text-lg font-bold text-zinc-900 dark:text-white">{t("depositFor", { name: selectedParticipant.name })}</h2>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">{t("currentBalance")}</label>
                <div className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-bold text-zinc-900 dark:bg-zinc-800 dark:text-white">
                  {money(selectedParticipant.balance, state.settings.currency)}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">{t("depositAmount")}</label>
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder={t("enterAmountExample")}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-800 dark:bg-zinc-900 focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:outline-none"
                />
              </div>
              {depositAmount && parseFloat(depositAmount) > 0 && (
                <div className="rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">{t("newBalanceAfterDeposit")}</p>
                  <p className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-300">
                    {money(selectedParticipant.balance + parseFloat(depositAmount), state.settings.currency)}
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <button className="btn-secondary flex-1 h-10 text-sm font-semibold rounded-lg transition-all" disabled={busy} onClick={() => { setShowDeposit(false); setSelectedParticipant(null); setDepositAmount(""); }}>{t("cancel")}</button>
              <button className={`flex-1 h-10 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${busy ? "bg-emerald-500 text-white shadow-lg" : (depositAmount && parseFloat(depositAmount) > 0 ? "btn-primary hover:shadow-lg hover:scale-105 active:scale-95" : "bg-zinc-200 text-zinc-400 cursor-not-allowed dark:bg-zinc-800")}`} disabled={busy || !depositAmount || parseFloat(depositAmount) <= 0} onClick={addDeposit}>
                {busy ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    {t("processing")}
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    {t("addFunds")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBothModal && selectedParticipantForBoth && pendingNumber !== null ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div className="panel w-full max-w-[380px] overflow-hidden shadow-xl">
            <div className="border-b border-zinc-200 bg-purple-50 px-4 py-3 dark:border-zinc-800 dark:bg-purple-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">Both Games</p>
              <h2 className="mt-1 text-lg font-bold">{selectedParticipantForBoth.name} - #{pendingNumber} ({pendingNumber % 2 === 0 ? "EVEN" : "ODD"})</h2>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Even-Odd Bet Amount (0.5K - 100K)</label>
                <input
                  type="number"
                  step="500"
                  min="500"
                  max="100000"
                  value={bothGameAmount}
                  onChange={(e) => setBothGameAmount(Math.max(500, Math.min(100000, parseInt(e.target.value) || 500)))}
                  className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                />
              </div>
              <div className="rounded-lg bg-purple-50 px-3 py-2 dark:bg-purple-950/30">
                <p className="text-xs text-purple-700 dark:text-purple-300">Numbers ticket: {money(state?.settings.ticketPrice ?? 200, state?.settings.currency)}</p>
                <p className="text-xs text-purple-700 dark:text-purple-300">Even-Odd bet: {money(bothGameAmount, state?.settings.currency)}</p>
              </div>
            </div>
            <div className="flex gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <button className="btn-secondary flex-1 h-10 text-sm" onClick={async () => {
                if (!selectedParticipantForBoth || pendingNumber === null) return;
                const participantId = selectedParticipantForBoth.id;
                const number = pendingNumber;
                setShowBothModal(false);
                try {
                  setBusy(true);
                  await api("/api/numbers/assign", { method: "POST", body: JSON.stringify({ participantId, selectedNumber: number }) });
                  setSelectedParticipantForBoth(null);
                  setPendingNumber(null);
                  await load();
                  toast.success(t("participantAdded"));
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : t("couldNotAssignNumber"));
                } finally {
                  setBusy(false);
                }
              }}>{t("cancel")}</button>
              <button className="btn-primary flex-1 h-10 text-sm" onClick={confirmBothGame}>Play Both</button>
            </div>
          </div>
        </div>
      ) : null}

      {showRegistration ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={form.handleSubmit(addParticipant)} className="panel w-full max-w-[360px] p-3 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">{t("participantRegistration")}</h2>
              <button type="button" className="btn-secondary !h-7 !px-2" onClick={() => setShowRegistration(false)}><X size={14} /></button>
            </div>
            <div className="mt-3 grid gap-2">
              <label className="block text-xs font-medium">
                {t("participantName")}
                <input className="mt-1 h-8 text-xs" placeholder="Abebe Kebede" {...form.register("name")} />
              </label>
              <label className="block text-xs font-medium">
                {t("amount")}
                <input className="mt-1 h-8 text-xs" type="number" step="1" {...form.register("amount")} />
              </label>
            </div>
            <button className="btn-primary mt-3 h-8 w-full text-xs" disabled={busy}><Plus size={14} />{t("addParticipant")}</button>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}