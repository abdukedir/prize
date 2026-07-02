"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/auth-guard";
import { api, money } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import { activeLanguages } from "@/lib/language-options";
import { settingsSchema } from "@/lib/validators";

type FormData = z.infer<typeof settingsSchema>;

export default function SettingsPage() {
  const { user, loading } = useMe();
  const { t } = useI18n();
  const form = useForm<FormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { ticketPrice: 200, firstPrize: 1000, secondPrize: 200, winnerRate: 200, currency: "ETB", language: "en", theme: "light", adminFeePercentage: 10 }
  });
  const ticketPrice = form.watch("ticketPrice");
  const winnerRate = form.watch("winnerRate");
  const currency = form.watch("currency");

  useEffect(() => {
    api<{ settings: FormData }>("/api/settings")
      .then((data) => form.reset(data.settings))
      .catch(() => toast.error(t("couldNotLoadSettings")));
  }, [form, t]);

  async function onSubmit(values: FormData) {
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(values) });
      document.documentElement.classList.toggle("dark", values.theme === "dark");
      window.dispatchEvent(new CustomEvent("languagechange", { detail: values.language }));
      toast.success(t("settingsUpdated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("couldNotSaveSettings"));
    }
  }

  if (loading || !user) return <main className="p-6 text-sm text-zinc-500">{t("loading")}</main>;

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{t("dynamicConfiguration")}</p>
          <h1 className="text-3xl font-bold tracking-tight">{t("settings")}</h1>
        </div>
        <form onSubmit={form.handleSubmit(onSubmit)} className="panel p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <input type="hidden" {...form.register("firstPrize")} />
            <input type="hidden" {...form.register("secondPrize")} />
            <label className="block text-sm font-medium">{t("ticketPrice")}
              <input className="mt-2" type="number" step="1" {...form.register("ticketPrice")} />
            </label>
            <label className="block text-sm font-medium">{t("winnerRateDeduction")}
              <input className="mt-2" type="number" step="1" {...form.register("winnerRate")} />
            </label>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900 md:col-span-2">
              <p className="font-semibold">{t("numbersPayoutRules")}</p>
              <div className="mt-2 grid gap-2 text-zinc-600 dark:text-zinc-300 md:grid-cols-2">
                <p>{t("firstPrizeRule")}</p>
                <p>{t("secondPrizeRule", { amount: money(ticketPrice ?? 0, currency) })}</p>
              </div>
            </div>
            <label className="block text-sm font-medium">{t("currency")}
              <select className="mt-2" {...form.register("currency")}>
                <option value="ETB">ETB</option>
              </select>
            </label>
            <label className="block text-sm font-medium">{t("language")}
              <select className="mt-2" {...form.register("language")}>
                {activeLanguages.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">{t("theme")}
              <select className="mt-2" {...form.register("theme")}>
                <option value="light">{t("light")}</option>
                <option value="dark">{t("dark")}</option>
              </select>
            </label>
          </div>
          <button className="btn-primary mt-6" disabled={form.formState.isSubmitting}><Save size={16} />{t("saveSettings")}</button>
        </form>
      </div>
    </AppShell>
  );
}
