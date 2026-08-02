"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scale, Play, Plus, RefreshCw, Trash2, UserCheck, UserX, X } from "lucide-react";
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

function oppositeSide(side: Side): Side {
  return side === "EVEN" ? "ODD" : "EVEN";
}

function resultNumberForSide(side: Side) {
  return side === "EVEN" ? 2 : 1;
}

function isRoomExpired(room: Room) {
  return new Date(room.expiresAt).getTime() <= Date.now();
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

  function selectParticipant(participantId: string) {
    selectedParticipantRef.current = participantId;
    setSelectedParticipantId(participantId);
    if (typeof window !== "undefined") window.localStorage.setItem(selectedParticipantStorageKey, participantId);
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
  const playedEvenOddGames = state?.latestResult ? Math.max(0, state.latestResult.number - 1057) : 0;
  const activeRooms = useMemo(() => (state?.rooms ?? []).filter((room) => (room.status === "WAITING" || room.status === "MATCHED") && !isRoomExpired(room)), [state]);
  const waitingRooms = activeRooms.filter((room) => room.status === "WAITING");
  const matchedRooms = activeRooms.filter((room) => room.status === "MATCHED");
  const selectedByParticipant = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const room of activeRooms) {
      for (const bet of room.bets) {
        grouped.set(bet.participantId, [...(grouped.get(bet.participantId) ?? []), `${formatK(bet.amount)} ${bet.side}`]);
      }
    }
    return grouped;
  }, [activeRooms]);
  const matchingRoom = waitingRooms.find((room) => room.creatorSide !== selectedSide && room.remaining > 0 && !isRoomExpired(room));
  const balanceShortfall = participant ? Math.max(0, selectedAmount - participant.balance) : 0;
  const balanceAfterBet = participant ? participant.balance - selectedAmount : 0;

  const [rowStates, setRowStates] = useState<Record<string, { side: Side; betAmount: number; selectedAmount?: number }>>({});

  useEffect(() => {
    const next: Record<string, { side: Side; betAmount: number; selectedAmount?: number }> = {};
    (state?.participants ?? []).forEach((p, i) => {
      const selected = selectedByParticipant.get(p.id) ?? [];
      const parsedSelectedAmount = selected.length > 0 ? Number((selected[0] || "").split(" ")[0].replace(/[^0-9.]/g, "")) || undefined : undefined;
      next[p.id] = { side: "EVEN", betAmount: Math.min(50000, Math.max(500, (i + 1) * 100)), selectedAmount: parsedSelectedAmount };
    });
    setRowStates(next);
  }, [state, selectedByParticipant]);

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

  async function placeBet(skipExistingBetPrompt = false, overrideParticipantId?: string, overrideSide?: Side, overrideAmount?: number) {
    const localParticipantId = overrideParticipantId ?? selectedParticipantId;
    const localSide = overrideSide ?? selectedSide;
    const localAmount = overrideAmount ?? selectedAmount;

    if (!localParticipantId) return toast.error("Select a player");
    if (!Number.isFinite(localAmount) || localAmount < 500 || localAmount > 100000 || localAmount % 500 !== 0) {
      return toast.error("Amount must be 0.5K to 100K in 0.5K steps");
    }

    const localParticipant = state?.participants.find((p) => p.id === localParticipantId);
    if (!localParticipant) return toast.error("Select a player");
    const shortfall = Math.max(0, localAmount - (localParticipant?.balance ?? 0));
    if (localParticipant.balance < localAmount) {
      return toast.error(`${localParticipant.name} needs ${money(shortfall)} more to play ${formatK(localAmount)}`);
    }

    // allow multiple consecutive bets without an extra confirmation prompt

    try {
      setBusy(true);
      const localMatchingRoom = waitingRooms.find((room) => room.creatorSide !== localSide && room.remaining > 0 && !isRoomExpired(room));
      if (localMatchingRoom) {
        if (isRoomExpired(localMatchingRoom)) {
          await load(true, selectedParticipantRef.current);
          return toast.error("That room has expired. Try placing the bet again.");
        }
        if (localAmount > localMatchingRoom.remaining) return toast.error(`Only ${formatK(localMatchingRoom.remaining)} remains to match this room`);
        await api(`/api/even-odd/rooms/${localMatchingRoom.id}/join`, { method: "POST", body: JSON.stringify({ participantId: localParticipantId, amount: localAmount }) });
        toast.success(localAmount === localMatchingRoom.remaining ? "Room matched" : "Bet added to matching side");
      } else {
        await api("/api/even-odd", { method: "POST", body: JSON.stringify({ participantId: localParticipantId, side: localSide, amount: localAmount }) });
        toast.success(`${formatK(localAmount)} ${localSide.toLowerCase()} bet opened`);
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
    if (matchedRooms.length === 0) return toast.error("Match both sides before finishing the game");

    try {
      setBusy(true);
      await api(`/api/even-odd/result?roundId=${state.round.id}`, { method: "POST", body: JSON.stringify({ selectedNumber: resultNumberForSide(resultSide) }) });
      await load(true, selectedParticipantRef.current);
      toast.success(`${resultSide} wins. House fee applied.`);
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
      toast.success("Deposit added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add deposit");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="p-6 text-sm text-zinc-500">{t("loading")}</main>;

  const totalEven = activeRooms.reduce((sum, room) => sum + room.evenTotal, 0);
  const totalOdd = activeRooms.reduce((sum, room) => sum + room.oddTotal, 0);
  const totalPlayers = state?.participants.length ?? 0;
  const activeRoomsCount = activeRooms.length;
  const matchedRoomsCount = matchedRooms.length;
  const balanceGap = Math.abs(totalEven - totalOdd);
  const remainingAmount = matchingRoom?.remaining ?? 0;

  return (
    <AppShell user={user}>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400">Played Even/Odd Games: {state ? playedEvenOddGames : "..."}</p>
            <h1 className="text-xl font-bold">Even / Odd</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Select a participant, choose a side, and place the bet.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary h-10 px-4 text-sm" onClick={() => setShowRegistration(true)} disabled={busy}>
              <Plus size={16} />
              Add Participant
            </button>
            <button className="btn-secondary h-10 px-4 text-sm" onClick={() => load()} disabled={busy}>
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>

        <div className="panel space-y-4 p-4">
          <div className="overflow-x-auto">
            <div className="flex flex-wrap gap-2">
              {(state?.participants ?? []).map((item) => (
                <button
                  key={item.id}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${selectedParticipantId === item.id ? "bg-emerald-600 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"}`}
                  onClick={() => selectParticipant(item.id)}
                  disabled={busy}
                >
                  {item.name}
                </button>
              ))}
              {(state?.participants ?? []).length === 0 ? (
                <span className="rounded-full border border-dashed border-zinc-200 px-3 py-1.5 text-sm text-zinc-400">No participants yet</span>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-700 dark:text-emerald-300">Played Even/Odd Games</p>
                <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">{state ? playedEvenOddGames : "..."}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 w-full sm:w-auto">
                <div className="rounded-3xl border border-zinc-200 bg-white p-4 text-center text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Even</div>
                  <div className="mt-3 text-2xl font-bold">{money(totalEven)}</div>
                </div>
                <div className="rounded-3xl border border-zinc-200 bg-white p-4 text-center text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Odd</div>
                  <div className="mt-3 text-2xl font-bold">{money(totalOdd)}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-emerald-200 bg-white p-4 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-200">
              {balanceGap === 0 ? (
                <span className="font-medium">Game is balanced - ready to finish</span>
              ) : (
                <span className="font-medium">{selectedSide === "EVEN" ? "Odd" : "Even"} needs {money(balanceGap)} more</span>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.25em]">#</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.25em]">Name</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.25em]">Bet Amount (ETB)</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.25em]">Selected Amount (ETB)</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.25em]">Even/Odd</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.25em]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {(state?.participants ?? []).map((participant, index) => {
                    const row = rowStates[participant.id] ?? { side: "EVEN", betAmount: 500 };
                    return (
                      <tr key={participant.id} className={participant.id === selectedParticipantId ? "bg-emerald-50/70 dark:bg-emerald-950/30" : "bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"}>
                        <td className="px-4 py-4 text-center text-sm font-semibold text-zinc-600 dark:text-zinc-300">{index + 1}</td>
                        <td className="px-4 py-4">
                          <button
                            className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-sm font-semibold text-zinc-900 transition hover:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                            onClick={() => selectParticipant(participant.id)}
                          >
                            {participant.name}
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                            <span className="text-xs font-semibold text-zinc-500">ETB</span>
                            <input
                              className="w-full border-none bg-transparent px-0 text-sm text-zinc-900 outline-none dark:text-white"
                              type="number"
                              value={row.betAmount}
                              onChange={(e) => {
                                const val = Number(e.target.value || 0);
                                setRowStates((s) => ({ ...s, [participant.id]: { ...(s[participant.id] ?? { side: "EVEN", betAmount: 500 }), betAmount: val } }));
                              }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                            <span className="text-xs font-semibold text-zinc-500">ETB</span>
                            <input
                              className="w-full border-none bg-transparent px-0 text-sm text-zinc-900 outline-none dark:text-white"
                              type="number"
                              value={row.selectedAmount ?? ""}
                              onChange={(e) => {
                                const val = Number(e.target.value || 0);
                                setRowStates((s) => ({ ...s, [participant.id]: { ...(s[participant.id] ?? { side: "EVEN", betAmount: 500 }), selectedAmount: Number.isFinite(val) ? val : undefined } }));
                              }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-2">
                            {(["EVEN", "ODD"] as Side[]).map((side) => (
                              <button
                                key={side}
                                className={`rounded-full px-4 py-2 text-[11px] font-semibold ${row.side === side ? "bg-emerald-600 text-white" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"}`}
                                onClick={() => setRowStates((s) => ({ ...s, [participant.id]: { ...(s[participant.id] ?? { side: "EVEN", betAmount: 500 }), side } }))}
                              >
                                {side === "EVEN" ? "Even" : "Odd"}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-3xl bg-zinc-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
                            disabled={busy}
                            onClick={async () => {
                              selectParticipant(participant.id);
                              await placeBet(false, participant.id, row.side, row.betAmount);
                            }}
                          >
                            <Plus size={14} />
                            Place Bet
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

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
                <button className="btn-secondary flex-1 h-10 text-sm font-semibold" disabled={busy} onClick={() => setDepositParticipant(null)}>Cancel</button>
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







