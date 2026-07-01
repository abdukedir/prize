"use client";

import Link from "next/link";
import { ArrowRight, Hash, Split } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/auth-guard";
import { useI18n } from "@/lib/i18n";

export default function DashboardPage() {
  const { user, loading } = useMe();
  const { t } = useI18n();
  if (loading || !user) return <main className="p-6 text-sm text-zinc-500">{t("loading")}</main>;

  return (
    <AppShell user={user}>
      <section className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{t("gameSelection")}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{t("chooseLotteryGame")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500">{t("dashboardHint")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Link href="/games/numbers" className="group panel p-6 transition hover:-translate-y-0.5 hover:shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
                <Hash size={24} />
              </div>
              <ArrowRight className="text-zinc-400 transition group-hover:translate-x-1 group-hover:text-emerald-600" size={20} />
            </div>
            <h2 className="mt-8 text-2xl font-bold">{t("numbers")}</h2>
            <p className="mt-2 text-sm text-zinc-500">{t("numbersDescription")}</p>
          </Link>
          <Link href="/games/even-odd" className="group panel p-6 transition hover:-translate-y-0.5 hover:shadow-xl">
            <div className="grid h-12 w-12 place-items-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
              <Split size={24} />
            </div>
            <h2 className="mt-8 text-2xl font-bold">{t("evenOdd")}</h2>
            <p className="mt-2 text-sm text-zinc-500">{t("evenOddDescription")}</p>
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
