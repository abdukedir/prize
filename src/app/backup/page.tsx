"use client";

import { ChangeEvent } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";

export default function BackupPage() {
  const { t } = useI18n();
  function download() {
    window.location.href = "/api/backup";
  }

  async function restore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!confirm(t("restoreBackupConfirm"))) return;
    const text = await file.text();
    await api("/api/backup", { method: "POST", body: text });
    toast.success(t("backupRestored"));
  }

  return (
    <PageShell>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold">{t("backupRestore")}</h1>
        <p className="text-sm text-zinc-500">{t("backupHint")}</p>
        <section className="panel mt-6 grid gap-4 p-4 sm:grid-cols-2">
          <button className="btn-secondary" onClick={download}><Download size={17} />{t("downloadBackup")}</button>
          <label className="btn-secondary cursor-pointer">
            <Upload size={17} />
            {t("restoreBackup")}
            <input className="hidden" type="file" accept="application/json" onChange={restore} />
          </label>
        </section>
      </div>
    </PageShell>
  );
}
