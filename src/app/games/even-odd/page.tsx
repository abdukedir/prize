"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, Play, Plus, RefreshCw, Trash2, UserCheck, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/auth-guard";
import { api, money } from "@/lib/client";
import { useI18n } from "@/lib/i18n";

type Side = "EVEN" | "ODD";
type Participant = { id: string; name: string; balance: number; status: "ACTIVE" | "WINNER" | "LOST" | "DISABLED" };
type Bet = { id: string; participantId: string; participantName: string; side: Side; amount: number; payout: number; balance: number };
type Room = {
  id: string;
  roomNumber: number;
  creatorSide: Side;
  targetAmount: number;
  status: "WAITING" | "MATCHED" | "COMPLETED" | "CANCELLED" | "REFUNDED";
  winnerSide: Side | null;
  platformFee: number;
  totalPayout: number;
  evenTotal: number;
  oddTotal: number;
  remaining: number;
  expiresAt: string;
  bets: Bet[];
};
type Round = { id: string; number: number; status: string; selectedNumber: number | null; winningSide: Side | null; publishedAt: string | null; publishedByName: string | null };
type EvenOddState = { round: Round; latestResult: Round | null; rooms: Room[]; participants: Participant[] };

const amountOptions = [500, 1000, 2000, 3000, 5000, 10000, 20000, 50000, 100000];
const selectedParticipantStorageKey = "evenOddSelectedParticipantId";

function formatK(value: number) {
  return value >= 1000 ? `${value / 1000}K` : `${value}`;
}

function statusLabel(status: Participant["status"]) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function isRoomExpired(room: Room) {
  return room.status === "WAITING" && new Date(room.expiresAt).getTime() <= Date.now();
}

export default function EvenOddGamePage() {
  const { user, loading } = useMe();
  const { t } = useI18n();
  const [state, setState] = useState<EvenOddState | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const selectedParticipantRef = useRef("");
  const [selectedSide, setSelectedSide] = useState<Side>("EVEN");
  const [selectedAmount, setSelectedAmount] = useState(5000);
  const [customAmount, setCustomAmount] = useState("5000");
  const [resultSide, setResultSide] = useState<Side>("EVEN");
  const [depositParticipant, setDepositParticipant] = useState<Participant | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [showRegistration, setShowRegistration] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState("");
  const [newParticipantAmount, setNewParticipantAmount] = useState("200");
  const [showExistingBetPrompt, setShowExistingBetPrompt] = useState(false);
  const [showZeroBalance, setShowZeroBalance] = useState<Participant | null>(null);
  const [pendingBet, setPendingBet] = useState<{ participant: Participant; amount: number; side: Side } | null>(null);
  const [betDrafts, setBetDrafts] = useState<Record<string, { amount: string; side: Side }>>({});

  function selectParticipant(participantId: string) {
    selectedParticipantRef.current = selectedParticipantId === participantId ? "" : participantId;
    setSelectedParticipantId(selectedParticipantId === participantId ? "" : participantId);
    if (typeof window !== "undefined") window.localStorage.setItem(selectedParticipantStorageKey, selectedParticipantId === participantId ? "" : participantId);
  }

  async function load(silent = false, preferredParticipantId = selectedParticipantRef.current) {
    try {
      const data = await api<EvenOddState>("/api/even-odd");
      setState(data);
      const savedParticipantId = typeof window === "undefined" ? "" : window.localStorage.getItem(selectedParticipantStorageKey) ?? "";
      const nextParticipantId = preferredParticipantId || savedParticipantId || data.participants[0]?.id || "";
      if (nextParticipantId && data.participants.some((item) => item.id === nextParticipantId)) selectParticipant(nextParticipantId);
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not load Even/Odd");
    }
  }

  useEffect(() => {
    const savedParticipantId = window.localStorage.getItem(selectedParticipantStorageKey) ?? "";
    selectedParticipantRef.current = savedParticipantId;
    if (savedParticipantId) setSelectedParticipantId(savedParticipantId);
    load(false, savedParticipantId);
  }, []);

  const participant = state?.participants.find((item) => item.id === selectedParticipantId);
  const playedEvenOddGames = state?.rooms.filter(r => r.status === "COMPLETED").length ?? 0;
  const activeRooms = useMemo(() => (state?.rooms ?? []).filter((room) => (room.status === "WAITING" || room.status === "MATCHED") && !isRoomExpired(room)), [state]);
  const totalEven = activeRooms.reduce((sum, room) => sum + room.evenTotal, 0);
  const totalOdd = activeRooms.reduce((sum, room) => sum + room.oddTotal, 0);
  const isGameComplete = totalEven === totalOdd && totalEven > 0;
  const remaining = Math.abs(totalEven - totalOdd);
  const remainingSide = totalEven > totalOdd ? "ODD" : totalOdd > totalEven ? "EVEN" : null;
  const waitingRooms = activeRooms.filter((room) => room.status === "WAITING");
  const selectedByParticipant = useMemo(() => {
    const grouped = new Map<string, { label: string; amount: number; side: Side; roomId: string }[]>();
    for (const room of activeRooms) {
      for (const bet of room.bets) {
        const existing = grouped.get(bet.participantId) ?? [];
        grouped.set(bet.participantId, [...existing, { label: `${formatK(bet.amount)} ${t(bet.side === "EVEN" ? "even" : "odd")}`, amount: bet.amount, side: bet.side, roomId: room.id }]);
      }
    }
    return grouped;
  }, [activeRooms]);
  const selectedParticipantBets = selectedParticipantId ? selectedByParticipant.get(selectedParticipantId) ?? [] : [];

  function draftFor(participantId: string) {
    return betDrafts[participantId] ?? { amount: String(selectedAmount), side: selectedSide };
  }

  function updateDraft(participantId: string, patch: Partial<{ amount: string; side: Side }>) {
    setBetDrafts((previous) => ({ ...previous, [participantId]: { ...draftFor(participantId), ...patch } }));
  }

  function rowMatchingRoom(side: Side) {
    return waitingRooms.find((room) => room.creatorSide !== side && room.remaining > 0 && !isRoomExpired(room));
  }

  function selectAmount(amount: number) {
    setSelectedAmount(amount);
    setCustomAmount(String(amount));
  }

  function updateCustomAmount(value: string) {
    setCustomAmount(value);
    const amount = Number(value);
    if (Number.isFinite(amount)) setSelectedAmount(amount);
  }

  async function addParticipant() {
    if (!newParticipantName.trim()) return toast.error("Enter participant name");
    const amount = Number(newParticipantAmount);
    if (!Number.isFinite(amount) || amount < 0) return toast.error("Enter a valid amount");
    try {
      setBusy(true);
      const result = await api<{ participant: Participant }>("/api/numbers/participants", { method: "POST", body: JSON.stringify({ name: newParticipantName.trim(), amount }) });
      setShowRegistration(false);
      setNewParticipantName("");
      setNewParticipantAmount("200");
      setSelectedParticipantId(result.participant.id);
      await load(true, selectedParticipantRef.current);
      toast.success("Participant added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add participant");
    } finally {
      setBusy(false);
    }
  }

  async function placeBet(skipExistingBetPrompt = false) {
    if (!selectedParticipantId) return toast.error("Select a player");
    if (!participant) return toast.error("Select a player");
    await placeBetFor(participant, selectedAmount, selectedSide);
  }

  async function placeBetFor(targetParticipant: Participant, amount: number, side: Side) {
    selectedParticipantRef.current = targetParticipant.id;
    setSelectedParticipantId(targetParticipant.id);
    setSelectedAmount(amount);
    setCustomAmount(String(amount));
    setSelectedSide(side);
    if (!Number.isFinite(amount) || amount < 500 || amount > 100000 || amount % 500 !== 0) {
      return toast.error("Amount must be 0.5K to 100K in 0.5K steps");
    }
    const shortfall = amount - targetParticipant.balance;
    if (shortfall > 0) {
      setPendingBet({ participant: targetParticipant, amount, side });
      setShowZeroBalance(targetParticipant);
      return;
    }
    await executeBet(amount, side, targetParticipant.id);
  }

  async function executeBet(amount: number, side: Side, participantId = selectedParticipantId) {
    try {
      setBusy(true);
      const rowBetToEdit = (selectedByParticipant.get(participantId) ?? [])[0] ?? null;
      const roomToMatch = rowMatchingRoom(side);
      if (rowBetToEdit) {
        await api(`/api/even-odd/rooms/${rowBetToEdit.roomId}/bets?oldAmount=${rowBetToEdit.amount}&oldSide=${rowBetToEdit.side}`, {
          method: "PATCH",
          body: JSON.stringify({ amount, side })
        });
      } else if (roomToMatch) {
        if (isRoomExpired(roomToMatch)) {
          await load(true, selectedParticipantRef.current);
          return toast.error("That room has expired. Try placing the bet again.");
        }
        if (amount > roomToMatch.remaining) return toast.error(`Only ${formatK(roomToMatch.remaining)} remains to match this room`);
        await api(`/api/even-odd/rooms/${roomToMatch.id}/join`, { method: "POST", body: JSON.stringify({ participantId, amount }) });
        toast.success(amount === roomToMatch.remaining ? "Room matched" : "Bet added to matching side");
      } else {
        await api("/api/even-odd", { method: "POST", body: JSON.stringify({ participantId, side, amount }) });
        toast.success(`${formatK(amount)} ${side.toLowerCase()} bet opened`);
      }
      await load(true, selectedParticipantRef.current);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not place bet";
      if (message.toLowerCase().includes("expired") || message.toLowerCase().includes("conflict")) {
        await load(true, selectedParticipantRef.current);
        toast.error("That room has expired. Try placing the bet again.");
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function finishGame() {
    if (!state) return;
    try {
      setBusy(true);
      await api("/api/even-odd/finish", { method: "POST", body: JSON.stringify({ winnerSide: resultSide }) });
      await load(true, selectedParticipantRef.current);
      toast.success("Game finished!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not finish game");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(participant: Participant) {
    const nextStatus = participant.status === "DISABLED" ? "ACTIVE" : "DISABLED";
    try {
      setBusy(true);
      await api(`/api/numbers/participants/${participant.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      await load(true, selectedParticipantRef.current);
      toast.success(nextStatus === "DISABLED" ? "Participant deactivated" : "Participant activated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update participant");
    } finally {
      setBusy(false);
    }
  }

  async function deleteParticipant(participant: Participant) {
    try {
      setBusy(true);
      await api(`/api/numbers/participants/${participant.id}`, { method: "DELETE" });
      if (participant.id === selectedParticipantId) selectParticipant("");
      await load(true, selectedParticipantRef.current);
      toast.success("Participant removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove participant");
    } finally {
      setBusy(false);
    }
  }

  async function addDeposit() {
    if (!depositParticipant || !depositAmount || parseFloat(depositAmount) <= 0) return toast.error("Enter a valid amount");
    try {
      setBusy(true);
      await api(`/api/participants/${depositParticipant.id}/deposit`, { method: "POST", body: JSON.stringify({ amount: parseFloat(depositAmount) }) });
      setDepositParticipant(null);
      setDepositAmount("");
      await load(true, selectedParticipantRef.current);
      if (pendingBet && depositParticipant.id === pendingBet.participant.id) {
        executeBet(pendingBet.amount, pendingBet.side);
        setPendingBet(null);
      }
      toast.success("Deposit added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add deposit");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="p-6 text-xs text-zinc-500">{t("loading")}</main>;

  return (
    <AppShell user={user}>
      <div className="space-y-2 text-xs sm:text-[11px]">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <h1 className="text-xs font-bold">Participant</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary h-8 px-2 sm:!px-3 text-[9px] sm:text-[8px]" onClick={() => setShowRegistration(true)} disabled={busy}>
              <Plus size={14} />
              <span className="hidden sm:inline">Add Participant</span>
            </button>
            <button className="btn-secondary h-8 px-2 sm:!px-3 text-[9px] sm:text-[8px]" onClick={() => load()} disabled={busy}>
              <RefreshCw size={14} />
              <span className="hidden sm:inline">{t("refresh")}</span>
            </button>
            {isGameComplete && (
              <button className="btn-primary h-8 px-2 sm:!px-3 text-[9px] sm:text-[8px]" onClick={finishGame} disabled={busy}>
                <Play size={14} />
                <span className="hidden sm:inline">Finish Game</span>
              </button>
            )}
          </div>
        </div>

        <section className="space-y-2">
          <div className="panel mx-auto flex w-full max-w-6xl flex-col overflow-auto p-2 text-[10px] sm:p-3">
            <div className="mb-2 flex flex-col gap-2 border-b border-zinc-100 pb-2 dark:border-zinc-800 sm:mb-3 sm:gap-3 sm:pb-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-[9px] leading-4 text-zinc-600 dark:text-zinc-300 sm:grid sm:grid-cols-4 sm:text-[10px]">
                <span className="min-w-[96px]"><b className="text-emerald-700 dark:text-emerald-300">Played:</b> {state ? playedEvenOddGames : "..."}</span>
                <span className="min-w-[96px]"><b className="text-emerald-700 dark:text-emerald-300">Even:</b> {money(totalEven, "ETB")}</span>
                <span className="min-w-[96px]"><b className="text-emerald-700 dark:text-emerald-300">Odd:</b> {money(totalOdd, "ETB")}</span>
                <span className={`min-w-[96px] ${remainingSide ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {remainingSide ? `${remainingSide} needs ${money(remaining, "ETB")}` : "Balanced"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
                  {(["EVEN", "ODD"] as Side[]).map((side) => (
                    <button
                      key={`winner-${side}`}
                      className={`h-7 px-2 text-[8px] font-bold sm:h-8 sm:px-3 sm:text-[8px] ${resultSide === side ? "bg-emerald-500 text-white" : "bg-white text-zinc-700 hover:bg-emerald-50 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"}`}
                      onClick={() => setResultSide(side)}
                      disabled={busy}
                    >
                      {t(side === "EVEN" ? "even" : "odd")} Winner
                    </button>
                  ))}
                </div>
                <button
                  className={`flex h-7 items-center justify-center gap-1 rounded-md px-2 text-[9px] font-semibold transition sm:h-8 sm:px-3 sm:text-[9px] ${isGameComplete ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white" : "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"}`}
                  disabled={busy || !isGameComplete}
                  onClick={finishGame}
                >
                  <Flag size={13} />
                  Finish
                </button>
              </div>
            </div>
            <div className="overflow-hidden rounded border border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/40">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-[10px] sm:min-w-[900px] sm:text-xs">
                  <thead>
                    <tr className="bg-zinc-50 text-left text-[8px] uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400 sm:text-[10px]">
                      <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">Name</th>
                      <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">Bet amount</th>
                      <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">Even / Odd</th>
                      <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">Place bet</th>
                      <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">Selected</th>
                      <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">Balance</th>
                      <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">Status</th>
                      <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {(state?.participants ?? []).map((participant) => {
                      const selected = selectedByParticipant.get(participant.id) ?? [];
                      const draft = draftFor(participant.id);
                      const draftAmount = Number(draft.amount);
                      const participantEvenTotal = selected.filter((item) => item.side === "EVEN").reduce((sum, item) => sum + item.amount, 0);
                      const participantOddTotal = selected.filter((item) => item.side === "ODD").reduce((sum, item) => sum + item.amount, 0);

                      return (
                        <tr
                          key={participant.id}
                          className={participant.id === selectedParticipantId ? "bg-emerald-50/70 dark:bg-emerald-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"}
                          onClick={() => selectParticipant(participant.id)}
                        >
                          <td className="px-2 py-2 align-top sm:px-3 sm:py-3">
                            <div className="text-[10px] font-semibold leading-4 text-zinc-900 dark:text-zinc-50 sm:text-xs">{participant.name}</div>
                          </td>
                          <td className="px-2 py-2 align-top sm:px-3 sm:py-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <input
                                type="number"
                                min="500"
                                max="100000"
                                step="500"
                                value={draft.amount}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => updateDraft(participant.id, { amount: event.target.value })}
                                className="h-8 w-full rounded-md border border-zinc-200 px-1.5 text-[11px] dark:border-zinc-800 dark:bg-zinc-950 sm:h-9 sm:w-28 sm:px-2 sm:text-sm"
                              />
                              <select
                                className="h-7 w-full rounded-md border border-zinc-200 px-1 text-[9px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 sm:h-8 sm:w-28 sm:text-xs"
                                value=""
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => {
                                  if (event.target.value) updateDraft(participant.id, { amount: event.target.value });
                                }}
                              >
                                <option value="">Quick amount</option>
                                {amountOptions.map((amount) => (
                                  <option key={amount} value={amount}>{formatK(amount)}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="px-2 py-2 align-top sm:px-3 sm:py-3">
                            <div className="inline-flex overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
                              {(["EVEN", "ODD"] as Side[]).map((side) => (
                                <button
                                  key={`${participant.id}-${side}`}
                                  className={`h-8 px-2 text-[10px] font-semibold sm:h-9 sm:px-3 sm:text-xs ${draft.side === side ? "bg-emerald-500 text-white" : "bg-white text-zinc-700 hover:bg-emerald-50 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    updateDraft(participant.id, { side });
                                  }}
                                  disabled={busy}
                                >
                                  {t(side === "EVEN" ? "even" : "odd")}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-2 py-2 align-top sm:px-3 sm:py-3">
                            <button
                              className="flex h-8 items-center gap-1 rounded-md bg-zinc-900 px-2 text-[10px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white sm:h-9 sm:px-3 sm:text-sm"
                              disabled={busy}
                              onClick={(event) => {
                                event.stopPropagation();
                                placeBetFor(participant, draftAmount, draft.side);
                              }}
                            >
                              <Plus size={14} />
                              Place bet
                            </button>
                          </td>
                          <td className="px-2 py-2 align-top sm:px-3 sm:py-3">
                            <div className="flex max-w-[130px] flex-wrap gap-1 sm:max-w-[180px]">
                              {selected.length > 0 ? selected.map((item) => (
                                <span key={item.label} className="flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 sm:px-2 sm:py-1 sm:text-xs">
                                  {item.label}
                                  <button
                                    className="text-[8px] text-emerald-600 hover:text-emerald-800 sm:text-[10px]"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      updateDraft(participant.id, { amount: String(item.amount), side: item.side });
                                    }}
                                  >
                                    Edit
                                  </button>
                                </span>
                              )) : <span className="text-[10px] text-zinc-400 sm:text-xs">-</span>}
                            </div>
                          </td>
                          <td className="px-2 py-2 align-top text-[11px] font-semibold sm:px-3 sm:py-3 sm:text-sm">{money(participant.balance)}</td>
                          <td className="px-2 py-2 align-top sm:px-3 sm:py-3">
                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold sm:px-2 sm:py-1 sm:text-xs ${participant.status === "DISABLED" ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}`}>
                              {statusLabel(participant.status)}
                            </span>
                          </td>
                          <td className="px-2 py-2 align-top sm:px-3 sm:py-3">
                            <div className="flex flex-wrap gap-1">
                              <button className="btn-secondary h-7 !px-1.5 text-[10px] sm:h-8 sm:!px-2 sm:text-xs" onClick={(event) => { event.stopPropagation(); updateStatus(participant); }} disabled={busy} title={participant.status === "DISABLED" ? "Activate participant" : "Deactivate participant"}>
                                {participant.status === "DISABLED" ? <UserCheck size={12} /> : <UserX size={12} />}
                              </button>
                              <button className={`flex h-7 items-center gap-1 !px-1.5 text-[10px] sm:h-8 sm:!px-2 sm:text-xs ${participant.balance <= 0 ? "btn-primary" : "btn-secondary"}`} onClick={(event) => { event.stopPropagation(); setDepositParticipant(participant); setDepositAmount(""); }} disabled={busy} title="Add funds">
                                <Plus size={12} />
                              </button>
                              <button className="btn-danger h-7 !px-1.5 text-[10px] sm:h-8 sm:!px-2 sm:text-xs" onClick={(event) => { event.stopPropagation(); deleteParticipant(participant); }} disabled={busy} title="Remove permanently">
                                <Trash2 size={12} />
                              </button>
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

        {showExistingBetPrompt && participant && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="panel w-full max-w-[380px] overflow-hidden shadow-xl">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Existing Selection</p>
                <h2 className="mt-1 text-base font-bold text-zinc-900 dark:text-white">{participant.name} already selected</h2>
              </div>
              <div className="space-y-3 p-4 text-xs text-zinc-700 dark:text-zinc-300">
                <p>Current selection: <b>{selectedParticipantBets.join(", ")}</b></p>
                <p>Choose whether to add this new bet or go back and change the amount/side.</p>
              </div>
              <div className="flex gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <button className="btn-secondary flex-1 h-9 text-xs font-semibold" disabled={busy} onClick={() => setShowExistingBetPrompt(false)}>Change</button>
                <button className="btn-primary flex-1 h-9 text-xs font-semibold" disabled={busy} onClick={() => { setShowExistingBetPrompt(false); placeBet(true); }}>
                  <Plus size={14} />
                  Add Bet
                </button>
              </div>
            </div>
          </div>
        )}

        {showRegistration ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="panel w-full max-w-[360px] p-3 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold">Participant Registration</h2>
                <button type="button" className="btn-secondary !h-7 !px-2" onClick={() => setShowRegistration(false)} disabled={busy}>
                  <X size={14} />
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                <label className="block text-xs font-medium">
                  Participant Name
                  <input className="mt-1 h-8 text-xs" placeholder="Abebe Kebede" value={newParticipantName} onChange={(event) => setNewParticipantName(event.target.value)} />
                </label>
                <label className="block text-xs font-medium">
                  Amount
                  <input className="mt-1 h-8 text-xs" type="number" step="1" value={newParticipantAmount} onChange={(event) => setNewParticipantAmount(event.target.value)} />
                </label>
              </div>
              <button className="btn-primary mt-3 h-8 w-full text-xs" disabled={busy} onClick={addParticipant}>
                <Plus size={14} />
                Add Participant
              </button>
            </div>
          </div>
        ) : null}

        {showZeroBalance ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
            <div className="panel w-full max-w-[420px] overflow-hidden shadow-xl">
              <div className="border-b border-zinc-200 bg-red-50 px-4 py-3 dark:border-zinc-800 dark:bg-red-950/30">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Balance Alert</p>
                <h2 className="mt-1 text-base font-bold text-zinc-900 dark:text-white">Balance Zero</h2>
              </div>
              <div className="space-y-3 p-4">
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  {showZeroBalance.name} has insufficient balance for this bet. Play with negative balance or add funds?
                </p>
                <div className="rounded-lg bg-yellow-50 px-3 py-2 dark:bg-yellow-950/30">
                  <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">Current Balance: <span className="font-bold">{money(showZeroBalance.balance)}</span></p>
                </div>
              </div>
              <div className="flex gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <button className="btn-secondary flex-1 h-10 text-xs font-semibold" onClick={() => { if (pendingBet) executeBet(pendingBet.amount, pendingBet.side); setShowZeroBalance(null); setPendingBet(null); }}>Allow Play (Negative)</button>
                <button className="btn-primary flex-1 h-10 text-xs font-semibold" onClick={() => { setDepositParticipant(showZeroBalance); setDepositAmount(""); setShowZeroBalance(null); setPendingBet(null); }}>Add Funds</button>
              </div>
            </div>
          </div>
        ) : null}

        {depositParticipant ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="panel w-full max-w-[380px] overflow-hidden shadow-xl">
              <div className="border-b border-zinc-200 bg-emerald-50 px-4 py-3 dark:border-zinc-800 dark:bg-emerald-950/30">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Add Deposit</p>
                <h2 className="mt-1 text-base font-bold text-zinc-900 dark:text-white">Deposit for {depositParticipant.name}</h2>
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Current Balance</label>
                  <div className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-bold text-zinc-900 dark:bg-zinc-800 dark:text-white">
                    {money(depositParticipant.balance)}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Deposit Amount</label>
                  <input
                    autoFocus
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="1000"
                    value={depositAmount}
                    onChange={(event) => setDepositAmount(event.target.value)}
                    className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-xs dark:border-zinc-800 dark:bg-zinc-900 focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <button className="btn-secondary flex-1 h-10 text-xs font-semibold" disabled={busy} onClick={() => { setDepositParticipant(null); setPendingBet(null); }}>Cancel</button>
                <button className="btn-primary flex-1 h-10 text-xs font-semibold" disabled={busy} onClick={addDeposit}>
                  <Plus size={16} />
                  Add Funds
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

