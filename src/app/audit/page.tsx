"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { api, date } from "@/lib/client";
import { useI18n } from "@/lib/i18n";

type Log = { id: string; action: string; createdAt: string; user?: { name: string; email: string } | null };

export default function AuditPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    api<{ logs: Log[] }>("/api/activity").then((data) => setLogs(data.logs));
  }, []);

  return (
    <PageShell>
      <section className="panel overflow-hidden">
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h1 className="text-2xl font-bold">{t("auditLogs")}</h1>
          <p className="text-sm text-zinc-500">{t("auditHint")}</p>
        </div>
        <table className="w-full text-sm">
          <thead className="table-head"><tr><th className="px-4 py-3">{t("user")}</th><th className="px-4 py-3">{t("action")}</th><th className="px-4 py-3">{t("date")}</th></tr></thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-3 font-medium">{log.user?.email ?? t("system")}</td>
                <td className="px-4 py-3">{log.action}</td>
                <td className="px-4 py-3 text-zinc-500">{date(log.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </PageShell>
  );
}
