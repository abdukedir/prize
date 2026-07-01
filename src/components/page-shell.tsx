"use client";

import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/auth-guard";
import { useI18n } from "@/lib/i18n";

export function PageShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useMe();
  const { t } = useI18n();
  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-sm text-zinc-500">{t("loadingWorkspace")}</div>;
  }
  return <AppShell user={user}>{children}</AppShell>;
}
