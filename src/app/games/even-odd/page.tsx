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

export default function EvenOddGamePage() {
  const { user, loading } = useMe();
  const { t } = useI18n();
  const [state, setState] = useState<EvenOddState | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const selectedParticipantRef = useRef("");
  const [drafts, setDrafts] = useState<Record<string, { amount: number; side: Side }>>({});
  const [depositParticipant, setDepositParticipant] = useState<Participant | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [showRegistration, setShowRegistration] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState("");
  const [newParticipantAmount, setNewParticipantAmount] = useState("200");
  const [showZeroBalance, setShowZeroBalance] = useState<Participant | null>(null);
  const [pendingBet, setPendingBet] = useState<{ participant: Participant; amount: number; side: Side } | null>(null);
  const [showFinishPopup, setShowFinishPopup] = useState(false);
  const [finishSide, setFinishSide] = useState<Side>("EVEN");
  const [showRemovePopup, setShowRemovePopup] = useState(false);
  const [removingParticipant, setRemovingParticipant] = useState<Participant | null>(null);

  function getDraft(id: string): { amount: number; side: Side } {
    return drafts[id] ?? { amount: 500, side: "EVEN" };
  }

  function updateDraft(id: string, patch: Partial<{ amount: number; side: Side }>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...getDraft(id), ...patch } }));
  }

  function clearDraft(id: string) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (selectedParticipantId === id) setSelectedParticipantId("");
  }

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
    const grouped = new Map<string, { label: string; amount: number; side: Side; roomId: string; betId: string }[]>();
    for (const room of activeRooms) {
      for (const bet of room.bets) {
        const existing = grouped.get(bet.participantId) ?? [];
        grouped.set(bet.participantId, [...existing, { label: `${formatK(bet.amount)} ${t(bet.side === "EVEN" ? "even" : "odd")}`, amount: bet.amount, side: bet.side, roomId: room.id, betId: bet.id }]);
      }
    }
    return grouped;
  }, [activeRooms, t]);

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
      selectParticipant(result.participant.id);
      await load(true, selectedParticipantRef.current);
      toast.success("Participant added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add participant");
    } finally {
      setBusy(false);
    }
  }

  async function placeBet(participant: Participant, amount: number, side: Side) {
    if (!Number.isFinite(amount) || amount < 500 || amount > 100000 || amount % 500 !== 0) {
      return toast.error("Amount must be 0.5K to 100K in 0.5K steps");
    }
    const shortfall = amount - participant.balance;
    if (shortfall > 0) {
      setPendingBet({ participant, amount, side });
      setShowZeroBalance(participant);
      return;
    }
    await executeBet(participant, amount, side);
  }

  async function executeBet(participant: Participant, amount: number, side: Side) {
    try {
      setBusy(true);
      const pBets = selectedByParticipant.get(participant.id) ?? [];
      const toEdit = pBets.length > 0 ? pBets[0] : null;
      if (toEdit) {
        const existingSide = toEdit.side as Side;
        const existingRoomId = toEdit.roomId;
        await api(`/api/even-odd/rooms/${existingRoomId}/bets?oldAmount=${toEdit.amount}&oldSide=${existingSide}`, {
          method: "PATCH",
          body: JSON.stringify({ amount, side: existingSide })
        });
      } else {
        const match = waitingRooms.find((room) => room.creatorSide !== side && room.remaining > 0 && !isRoomExpired(room));
        if (match) {
          if (amount > match.remaining) return toast.error(`Only ${formatK(match.remaining)} remains to match this room`);
          await api(`/api/even-odd/rooms/${match.id}/join`, { method: "POST", body: JSON.stringify({ participantId: participant.id, amount }) });
          toast.success(amount === match.remaining ? "Room matched" : "Bet added to matching side");
        } else {
          await api("/api/even-odd", { method: "POST", body: JSON.stringify({ participantId: participant.id, side, amount }) });
          toast.success(`${formatK(amount)} ${side.toLowerCase()} bet opened`);
        }
      }
      await load(true, participant.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not place bet";
      if (message.toLowerCase().includes("expired") || message.toLowerCase().includes("conflict")) {
        await load(true, participant.id);
        toast.error("That room has expired. Try placing the bet again.");
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function finishGame(winningSide: Side) {
    if (!state) return;
    try {
      setBusy(true);
      await api("/api/even-odd/finish", { method: "POST", body: JSON.stringify({ winningSide }) });
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
        executeBet(pendingBet.participant, pendingBet.amount, pendingBet.side);
        setPendingBet(null);
      }
      toast.success("Deposit added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add deposit");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveSelected(participant: Participant) {
    try {
      const waitingRoom = activeRooms.find((r) => r.status === "WAITING" && r.bets.some((b) => b.participantId === participant.id));
      if (waitingRoom) {
        const bet = waitingRoom.bets.find((b) => b.participantId === participant.id);
        if (bet) {
          await api(`/api/even-odd/rooms/${waitingRoom.id}/bets?betId=${bet.id}`, { method: "DELETE" });
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove bet");
    } finally {
      clearDraft(participant.id);
      await load(true, selectedParticipantRef.current);
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
              <button className="btn-primary h-8 px-2 sm:!px-3 text-[11px] sm:text-xs" onClick={() => setShowFinishPopup(true)} disabled={busy}>
                <Play size={14} />
                <span className="hidden sm:inline">Finish Game</span>
              </button>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11px] dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Played Even/Odd Games: {state ? playedEvenOddGames : "..."}</p>
          <div className="mt-1 flex items-center gap-4">
            <span className="text-zinc-600 dark:text-zinc-300">EVEN: <span className="font-bold text-emerald-600">{money(totalEven, "ETB")}</span></span>
            <span className="text-zinc-600 dark:text-zinc-300">ODD: <span className="font-bold text-emerald-600">{money(totalOdd, "ETB")}</span></span>
          </div>
          {remainingSide ? (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">Remaining {remainingSide}: {money(remaining, "ETB")} to finish</p>
          ) : (
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Game is balanced - ready to finish</p>
          )}
        </div>

        {showFinishPopup && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="panel w-full max-w-[320px] overflow-hidden shadow-xl">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Finish Game</p>
                <h2 className="mt-1 text-base font-bold text-zinc-900 dark:text-white">What to win?</h2>
              </div>
              <div className="grid grid-cols-2 gap-2 p-4">
                <button type="button" onClick={() => setFinishSide("EVEN")} className={`h-10 rounded text-sm font-bold transition ${finishSide === "EVEN" ? "bg-emerald-500 text-white" : "border border-zinc-200 bg-white hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950"}`}>EVEN</button>
                <button type="button" onClick={() => setFinishSide("ODD")} className={`h-10 rounded text-sm font-bold transition ${finishSide === "ODD" ? "bg-emerald-500 text-white" : "border border-zinc-200 bg-white hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950"}`}>ODD</button>
              </div>
              <div className="flex gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <button type="button" className="btn-secondary flex-1 h-9 text-xs font-semibold" onClick={() => setShowFinishPopup(false)}>Cancel</button>
                <button type="button" className="btn-primary flex-1 h-9 text-xs font-semibold" disabled={busy} onClick={() => { finishGame(finishSide); setShowFinishPopup(false); }}>Finish Game</button>
              </div>
            </div>
          </div>
        )}

        {showRemovePopup && removingParticipant && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="panel w-full max-w-[320px] overflow-hidden shadow-xl">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Remove Selection</p>
                <h2 className="mt-1 text-base font-bold text-zinc-900 dark:text-white">Remove selected bet for {removingParticipant.name}?</h2>
              </div>
              <div className="p-4 text-sm text-zinc-600 dark:text-zinc-300">This will clear the selected bet amount and side for this participant.</div>
              <div className="flex gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <button type="button" className="btn-secondary flex-1 h-9 text-xs font-semibold" onClick={() => { setShowRemovePopup(false); setRemovingParticipant(null); }}>Cancel</button>
                <button type="button" className="btn-primary flex-1 h-9 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white" disabled={busy} onClick={async () => { await handleRemoveSelected(removingParticipant!); setShowRemovePopup(false); setRemovingParticipant(null); }}>Remove</button>
              </div>
            </div>
          </div>
        )}

        <section className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Participant</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Balance</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Selected Bet</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Bet Amount</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Quick</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Even / Odd</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Action</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Remove</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-500">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {(state?.participants ?? []).map((p) => {
                  const draft = getDraft(p.id);
                  const selected = selectedByParticipant.get(p.id) ?? [];
                  return (
                    <tr key={p.id} className={p.id === selectedParticipantId ? "bg-emerald-50/60 dark:bg-emerald-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"}>
                      <td className="px-3 py-2">
                        <button className="font-medium text-zinc-900 dark:text-zinc-100" onClick={() => selectParticipant(p.id)}>{p.name}</button>
                      </td>
                      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">{money(p.balance)}</td>
                      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">
                        {selected.length > 0 ? selected.map(s => `${formatK(s.amount)} ${t(s.side === "EVEN" ? "even" : "odd")}`).join(", ") : "-"}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          max={100000}
                          step={500}
                          value={draft.amount}
                          onChange={(e) => {
                            const raw = Number(e.target.value);
                            if (!Number.isFinite(raw) || raw < 1) return;
                            updateDraft(p.id, { amount: raw });
                          }}
                          onBlur={(e) => {
                            const raw = Number(e.target.value);
                            if (!Number.isFinite(raw) || raw < 1) {
                              updateDraft(p.id, { amount: 500 });
                            }
                          }}
                          className="h-8 w-24 rounded-md border border-zinc-200 px-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={draft.amount}
                          onChange={(e) => updateDraft(p.id, { amount: Number(e.target.value) })}
                          className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          {[500, 1000, 2000, 3000, 4000, 5000, 6000, 10000, 20000, 50000, 100000].map((q) => (
                            <option key={q} value={q}>{formatK(q)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="inline-flex overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
                          <button
                            type="button"
                            disabled={selected.length > 0}
                            onClick={() => updateDraft(p.id, { side: "EVEN" })}
                            className={`px-3 py-1.5 text-[11px] font-semibold transition ${draft.side === "EVEN" && selected.length === 0 ? "bg-emerald-500 text-white" : selected.length > 0 && selected[0].side === "EVEN" ? "bg-emerald-500 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-300"} ${selected.length > 0 ? "opacity-70 cursor-not-allowed" : ""}`}
                          >EVEN</button>
                          <button
                            type="button"
                            disabled={selected.length > 0}
                            onClick={() => updateDraft(p.id, { side: "ODD" })}
                            className={`px-3 py-1.5 text-[11px] font-semibold transition border-l border-zinc-200 dark:border-zinc-800 ${draft.side === "ODD" && selected.length === 0 ? "bg-emerald-500 text-white" : selected.length > 0 && selected[0].side === "ODD" ? "bg-emerald-500 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-300"} ${selected.length > 0 ? "opacity-70 cursor-not-allowed" : ""}`}
                          >ODD</button>
                        </div>
                        {selected.length > 0 && (
                          <p className="mt-1 text-[9px] text-zinc-400">Locked to existing bet</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button className="btn-primary h-8 px-3 text-xs" disabled={busy} onClick={() => placeBet(p, draft.amount, draft.side)}>
                          <Plus size={14} />
                          Place Bet
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <button className="btn-secondary h-8 px-3 text-xs" onClick={() => { setRemovingParticipant(p); setShowRemovePopup(true); }}>Remove</button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <button className="btn-secondary h-7 !px-2 text-[10px]" onClick={() => updateStatus(p)} disabled={busy} title={p.status === "DISABLED" ? "Activate participant" : "Deactivate participant"}>
                            {p.status === "DISABLED" ? <UserCheck size={12} /> : <UserX size={12} />}
                          </button>
                          <button className="btn-secondary h-7 !px-2 text-[10px]" onClick={() => { setDepositParticipant(p); setDepositAmount(""); }} disabled={busy} title="Add funds">
                            <Plus size={12} />
                          </button>
                          <button className="btn-danger h-7 !px-2 text-[10px]" onClick={() => deleteParticipant(p)} disabled={busy} title="Remove permanently">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(state?.participants ?? []).length === 0 && (
              <div className="px-3 py-6 text-center text-[10px] text-zinc-400">No participants</div>
            )}
          </div>
        </section>

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
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Current Balance</label>
                  <div className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-bold text-zinc-900 dark:bg-zinc-800 dark:text-white">
                    {money(showZeroBalance.balance)}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <button className="btn-secondary flex-1 h-10 text-sm font-semibold" onClick={() => { if (pendingBet) executeBet(pendingBet.participant, pendingBet.amount, pendingBet.side); setShowZeroBalance(null); setPendingBet(null); }}>Allow Play (Negative)</button>
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
