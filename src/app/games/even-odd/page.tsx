"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Plus, RefreshCw, Trash2, UserCheck, UserX, X } from "lucide-react";
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

const selectedParticipantStorageKey = "evenOddSelectedParticipantId";

function formatK(value: number) {
  return value >= 1000 ? `${value / 1000}K` : `${value}`;
}

function statusLabel(status: Participant["status"]) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function isRoomExpired(room: Room) {
  return new Date(room.expiresAt).getTime() <= Date.now();
}

function calculateWinnerFee(rooms: Room[], winnerSide: Side, houseFeePercentage: number) {
  const completedRooms = rooms.filter(r => r.status === "COMPLETED" && r.winnerSide === winnerSide);
  const losingSideTotal = completedRooms.reduce((sum, room) => {
    return sum + (winnerSide === "EVEN" ? room.oddTotal : room.evenTotal);
  }, 0);
  return Math.floor(losingSideTotal * houseFeePercentage / 100);
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
  const [houseFeePercentage, setHouseFeePercentage] = useState(10);

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
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await api<{ settings: { evenOddHouseFeePercentage?: number } }>("/api/settings");
      if (res.settings.evenOddHouseFeePercentage) {
        setHouseFeePercentage(res.settings.evenOddHouseFeePercentage);
      }
    } catch {
      // Use default 10%
    }
  }

  const participant = state?.participants.find((item) => item.id === selectedParticipantId);
  const playedEvenOddGames = state?.rooms.filter(r => r.status === "COMPLETED").length ?? 0;
  const activeRooms = useMemo(() => (state?.rooms ?? []).filter((room) => (room.status === "WAITING" || room.status === "MATCHED") && !isRoomExpired(room)), [state]);
  const totalEven = activeRooms.reduce((sum, room) => sum + room.evenTotal, 0);
  const totalOdd = activeRooms.reduce((sum, room) => sum + room.oddTotal, 0);
  const isGameComplete = totalEven === totalOdd && totalEven > 0;
  const remaining = Math.abs(totalEven - totalOdd);
  const remainingSide = totalEven > totalOdd ? "ODD" : totalOdd > totalEven ? "EVEN" : null;
  const waitingRooms = activeRooms.filter((room) => room.status === "WAITING");
  const matchedRooms = activeRooms.filter((room) => room.status === "MATCHED");
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
  const matchingRoom = waitingRooms.find((room) => room.creatorSide !== selectedSide && room.remaining > 0 && !isRoomExpired(room));
  const selectedParticipantBets = selectedParticipantId ? selectedByParticipant.get(selectedParticipantId) ?? [] : [];
  const betToEditState = selectedParticipantBets.length > 0 ? selectedParticipantBets[0] : null;

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
    if (!Number.isFinite(selectedAmount) || selectedAmount < 500 || selectedAmount > 100000 || selectedAmount % 500 !== 0) {
      return toast.error("Amount must be 0.5K to 100K in 0.5K steps");
    }
    if (!participant) return toast.error("Select a player");
    const shortfall = selectedAmount - participant.balance;
    if (shortfall > 0) {
      setPendingBet({ participant, amount: selectedAmount, side: selectedSide });
      setShowZeroBalance(participant);
      return;
    }
    await executeBet(selectedAmount, selectedSide);
  }

  async function executeBet(amount: number, side: Side) {
    try {
      setBusy(true);
      if (betToEditState) {
        await api(`/api/even-odd/rooms/${betToEditState.roomId}/bets?oldAmount=${betToEditState.amount}&oldSide=${betToEditState.side}`, {
          method: "PATCH",
          body: JSON.stringify({ amount, side })
        });
      } else if (matchingRoom) {
        if (isRoomExpired(matchingRoom)) {
          await load(true, selectedParticipantRef.current);
          return toast.error("That room has expired. Try placing the bet again.");
        }
        if (amount > matchingRoom.remaining) return toast.error(`Only ${formatK(matchingRoom.remaining)} remains to match this room`);
        await api(`/api/even-odd/rooms/${matchingRoom.id}/join`, { method: "POST", body: JSON.stringify({ participantId: selectedParticipantId, amount }) });
        toast.success(amount === matchingRoom.remaining ? "Room matched" : "Bet added to matching side");
      } else {
        await api("/api/even-odd", { method: "POST", body: JSON.stringify({ participantId: selectedParticipantId, side, amount }) });
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
      await api("/api/even-odd/finish", { method: "POST" });
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

  if (loading || !user) return <main className="p-6 text-sm text-zinc-500">{t("loading")}</main>;

  return (
    <AppShell user={user}>
      <div className="space-y-2">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <h1 className="text-sm font-bold">Participant</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary h-8 px-2 sm:!px-3 text-[11px] sm:text-xs" onClick={() => setShowRegistration(true)} disabled={busy}>
              <Plus size={14} />
              <span className="hidden sm:inline">Add Participant</span>
            </button>
            <button className="btn-secondary h-8 px-2 sm:!px-3 text-[11px] sm:text-xs" onClick={() => load()} disabled={busy}>
              <RefreshCw size={14} />
              <span className="hidden sm:inline">{t("refresh")}</span>
            </button>
            {isGameComplete && (
              <button className="btn-primary h-8 px-2 sm:!px-3 text-[11px] sm:text-xs" onClick={finishGame} disabled={busy}>
                <Play size={14} />
                <span className="hidden sm:inline">Finish Game</span>
              </button>
            )}
          </div>
        </div>

        <section className="panel p-4">
          <div className="overflow-hidden rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/40">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-100 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">NAME</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">BET AMOUNT</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">EVEN / ODD</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">PLACE BET</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">SELECTED</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">BALANCE</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">STATUS</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {(state?.participants ?? []).map((participant) => {
                    const selected = selectedByParticipant.get(participant.id) ?? [];
                    return (
                      <tr key={participant.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className="px-3 py-3 font-medium text-zinc-900 dark:text-zinc-100">{participant.name}</td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min="500"
                            max="100000"
                            step="500"
                            value={selectedParticipantId === participant.id ? customAmount : "5000"}
                            onChange={(e) => {
                              if (selectedParticipantId === participant.id) updateCustomAmount(e.target.value);
                              else selectParticipant(participant.id);
                            }}
                            onClick={() => selectParticipant(participant.id)}
                            className="w-24 rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1">
                            {(["EVEN", "ODD"] as Side[]).map((side) => (
                              <button
                                key={side}
                                className={`rounded px-2 py-1 text-xs font-semibold transition ${selectedParticipantId === participant.id && selectedSide === side ? "bg-emerald-500 text-white" : "border border-zinc-300 bg-white hover:bg-emerald-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"}`}
                                onClick={() => {
                                  selectParticipant(participant.id);
                                  setSelectedSide(side);
                                }}
                              >
                                {side}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs font-semibold"
                            onClick={() => {
                              selectParticipant(participant.id);
                              placeBet();
                            }}
                            disabled={busy}
                          >
                            <Plus size={14} />
                            Place bet
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {selected.length > 0 ? selected.map((item) => (
                              <span key={item.label} className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                {item.label}
                              </span>
                            )) : <span className="text-zinc-400">-</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-medium text-zinc-900 dark:text-zinc-100">{money(participant.balance)}</td>
                        <td className="px-3 py-3">
                          {participant.status === "WINNER" ? (
                            <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              Winner
                            </span>
                          ) : participant.status === "LOST" ? (
                            <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                              Lost
                            </span>
                          ) : (
                            <span className="text-zinc-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1">
                            <button
                              className="rounded bg-zinc-200 p-1.5 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                              onClick={() => updateStatus(participant)}
                              disabled={busy}
                              title="Toggle status"
                            >
                              {participant.status === "DISABLED" ? <UserCheck size={14} /> : <UserX size={14} />}
                            </button>
                            <button
                              className="rounded bg-zinc-200 p-1.5 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                              onClick={() => {
                                setDepositParticipant(participant);
                                setDepositAmount("");
                              }}
                              disabled={busy}
                              title="Add deposit"
                            >
                              <Plus size={14} />
                            </button>
                            <button
                              className="rounded bg-red-200 p-1.5 hover:bg-red-300 dark:bg-red-900 dark:hover:bg-red-800"
                              onClick={() => deleteParticipant(participant)}
                              disabled={busy}
                              title="Delete participant"
                            >
                              <Trash2 size={14} />
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
        </section>

        {showExistingBetPrompt && participant && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="panel w-full max-w-[380px] overflow-hidden shadow-xl">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Existing Selection</p>
                <h2 className="mt-1 text-lg font-bold text-zinc-900 dark:text-white">{participant.name} already selected</h2>
              </div>
              <div className="space-y-3 p-4 text-sm text-zinc-700 dark:text-zinc-300">
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
                <h2 className="text-sm font-bold">Participant Registration</h2>
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
                <h2 className="mt-1 text-lg font-bold text-zinc-900 dark:text-white">Balance Zero</h2>
              </div>
              <div className="space-y-3 p-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  {showZeroBalance.name} has insufficient balance for this bet. Play with negative balance or add funds?
                </p>
                <div className="rounded-lg bg-yellow-50 px-3 py-2 dark:bg-yellow-950/30">
                  <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">Current Balance: <span className="font-bold">{money(showZeroBalance.balance)}</span></p>
                </div>
              </div>
              <div className="flex gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <button className="btn-secondary flex-1 h-10 text-sm font-semibold" onClick={() => { if (pendingBet) executeBet(pendingBet.amount, pendingBet.side); setShowZeroBalance(null); setPendingBet(null); }}>Allow Play (Negative)</button>
                <button className="btn-primary flex-1 h-10 text-sm font-semibold" onClick={() => { setDepositParticipant(showZeroBalance); setDepositAmount(""); setShowZeroBalance(null); setPendingBet(null); }}>Add Funds</button>
              </div>
            </div>
          </div>
        ) : null}

        {depositParticipant ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="panel w-full max-w-[380px] overflow-hidden shadow-xl">
              <div className="border-b border-zinc-200 bg-emerald-50 px-4 py-3 dark:border-zinc-800 dark:bg-emerald-950/30">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Add Deposit</p>
                <h2 className="mt-1 text-lg font-bold text-zinc-900 dark:text-white">Deposit for {depositParticipant.name}</h2>
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Current Balance</label>
                  <div className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-bold text-zinc-900 dark:bg-zinc-800 dark:text-white">
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
                    className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-800 dark:bg-zinc-900 focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <button className="btn-secondary flex-1 h-10 text-sm font-semibold" disabled={busy} onClick={() => { setDepositParticipant(null); setPendingBet(null); }}>Cancel</button>
                <button className="btn-primary flex-1 h-10 text-sm font-semibold" disabled={busy} onClick={addDeposit}>
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