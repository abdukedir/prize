"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageShell } from "@/components/page-shell";
import { useMe } from "@/components/auth-guard";
import { api, date, money } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import { participantSchema } from "@/lib/validators";

type Participant = { id: string; fullName: string; phoneNumber: string; amountDeposited: number; createdAt: string };
type FormData = z.infer<typeof participantSchema>;

export default function ParticipantsPage() {
  return (
    <PageShell>
      <ParticipantsContent />
    </PageShell>
  );
}

function ParticipantsContent() {
  const { user } = useMe();
  const { t } = useI18n();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Participant | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const form = useForm<FormData>({ resolver: zodResolver(participantSchema), defaultValues: { fullName: "", phoneNumber: "", amountDeposited: 0 } });

  function load() {
    api<{ participants: Participant[]; total: number }>(`/api/participants?page=${page}&search=${encodeURIComponent(search)}`).then((data) => {
      setParticipants(data.participants);
      setTotal(data.total);
    });
  }

  useEffect(load, [page, search]);

  async function save(values: FormData) {
    try {
      if (editing) {
        await api(`/api/participants/${editing.id}`, { method: "PUT", body: JSON.stringify(values) });
        toast.success(t("participantUpdated"));
      } else {
        await api("/api/participants", { method: "POST", body: JSON.stringify(values) });
        toast.success(t("participantAdded"));
      }
      form.reset({ fullName: "", phoneNumber: "", amountDeposited: 0 });
      setEditing(null);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    }
  }

  async function remove(id: string) {
    if (!confirm(t("deleteParticipantConfirm"))) return;
    await api(`/api/participants/${id}`, { method: "DELETE" });
    toast.success(t("participantDeleted"));
    load();
  }

  function startEdit(participant: Participant) {
    setEditing(participant);
    form.reset({ fullName: participant.fullName, phoneNumber: participant.phoneNumber, amountDeposited: participant.amountDeposited });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <section className="panel p-4">
        <h1 className="text-xl font-bold">{editing ? t("editParticipant") : t("addParticipantLower")}</h1>
        <form onSubmit={form.handleSubmit(save)} className="mt-5 space-y-4">
          <label className="block text-sm font-medium">{t("fullName")}<input className="mt-2" {...form.register("fullName")} /></label>
          <label className="block text-sm font-medium">{t("phoneNumber")}<input className="mt-2" {...form.register("phoneNumber")} /></label>
          <label className="block text-sm font-medium">{t("amountDeposited")}<input className="mt-2" type="number" step="0.01" {...form.register("amountDeposited")} /></label>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={form.formState.isSubmitting}><Plus size={17} />{editing ? t("save") : t("add")}</button>
            {editing && <button type="button" className="btn-secondary" onClick={() => { setEditing(null); form.reset(); }}>{t("cancel")}</button>}
          </div>
        </form>
      </section>
      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">{t("participants")}</h2>
            <p className="text-sm text-zinc-500">{t("records", { count: total })}</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 text-zinc-400" size={17} />
            <input className="pl-10" placeholder={t("searchParticipants")} value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head"><tr><th className="px-4 py-3">{t("name")}</th><th className="px-4 py-3">{t("phone")}</th><th className="px-4 py-3">{t("deposited")}</th><th className="px-4 py-3">{t("created")}</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>
              {participants.map((participant) => (
                <tr key={participant.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3 font-medium">{participant.fullName}</td>
                  <td className="px-4 py-3">{participant.phoneNumber}</td>
                  <td className="px-4 py-3">{money(participant.amountDeposited)}</td>
                  <td className="px-4 py-3 text-zinc-500">{date(participant.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary !px-3" onClick={() => startEdit(participant)} title={t("edit")}><Pencil size={16} /></button>
                      {user?.role === "ADMIN" && <button className="btn-danger !px-3" onClick={() => remove(participant.id)} title={t("delete")}><Trash2 size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <button className="btn-secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>{t("previous")}</button>
          <span>{t("page", { page })}</span>
          <button className="btn-secondary" disabled={page * 10 >= total} onClick={() => setPage((p) => p + 1)}>{t("next")}</button>
        </div>
      </section>
    </div>
  );
}
