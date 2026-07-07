"use client";

import { useEffect, useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [showHouseFeeModal, setShowHouseFeeModal] = useState(false);
  const form = useForm<FormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { ticketPrice: 200, firstPrize: 1000, secondPrize: 200, winnerRate: 200, currency: "ETB", language: "en", theme: "light", adminFeePercentage: 10 }
  });
  const ticketPrice = form.watch("ticketPrice");
  const winnerRate = form.watch("winnerRate");
  const currency = form.watch("currency");
  const adminFeePercentage = form.watch("adminFeePercentage");
  const [houseFee, setHouseFee] = useState(adminFeePercentage);
  const [sampleRows, setSampleRows] = useState([
    { amount: 500, feePercentage: adminFeePercentage },
    { amount: 1000, feePercentage: adminFeePercentage }
  ]);

  useEffect(() => {
    api<{ settings: FormData }>("/api/settings")
      .then((data) => form.reset(data.settings))
      .catch(() => toast.error(t("couldNotLoadSettings")));
  }, [form, t]);

  useEffect(() => {
    setHouseFee(adminFeePercentage);
    setSampleRows((rows) => rows.map((row) => ({ ...row, feePercentage: adminFeePercentage })));
  }, [adminFeePercentage]);

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

  async function applyHouseFee() {
    if (houseFee === null || houseFee === undefined || Number.isNaN(houseFee) || houseFee < 0 || houseFee > 100) {
      return toast.error("Enter a valid house fee between 0 and 100");
    }

    try {
      setBusy(true);
      const currentValues = form.getValues();
      const updatedValues = { ...currentValues, adminFeePercentage: houseFee };
      await api("/api/settings", { method: "PUT", body: JSON.stringify(updatedValues) });
      form.reset(updatedValues);
      setShowHouseFeeModal(false);
      toast.success("House fee updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("couldNotSaveSettings"));
    } finally {
      setBusy(false);
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
            <input type="hidden" {...form.register("adminFeePercentage")} />
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
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-zinc-600 dark:text-zinc-300">Current house fee: {adminFeePercentage}%</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowHouseFeeModal(true)}>Set House Fee</button>
              <button className="btn-primary" disabled={form.formState.isSubmitting}><Save size={16} />{t("saveSettings")}</button>
            </div>
          </div>
        </form>
        {showHouseFeeModal && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="panel w-full max-w-md p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold">Set House Fee</h2>
                <button type="button" className="btn-secondary !h-9 !px-2" onClick={() => setShowHouseFeeModal(false)} disabled={busy}>Cancel</button>
              </div>
              <div className="mt-4 grid gap-4">
                <div>
                  <label className="block text-sm font-medium">House fee percentage</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={houseFee}
                    onChange={(event) => setHouseFee(Number(event.target.value))}
                    className="mt-2 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  />
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="grid items-center gap-2 text-zinc-700 dark:text-zinc-300 sm:grid-cols-[1fr_120px_120px_40px]">
                    <div className="font-semibold">Bet amount</div>
                    <div className="font-semibold">Fee %</div>
                    <div className="font-semibold">Fee amount</div>
                    <div />
                  </div>
                  {sampleRows.map((row, index) => {
                    const feeAmount = (row.amount * (row.feePercentage ?? 0)) / 100;
                    return (
                      <div key={index} className="mt-3 grid items-center gap-2 sm:grid-cols-[1fr_120px_120px_40px]">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.amount}
                          onChange={(event) => setSampleRows((rows) => rows.map((item, idx) => idx === index ? { ...item, amount: Number(event.target.value) } : item))}
                          className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                        />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={row.feePercentage}
                          onChange={(event) => setSampleRows((rows) => rows.map((item, idx) => idx === index ? { ...item, feePercentage: Number(event.target.value) } : item))}
                          className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                        />
                        <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">{money(feeAmount, currency)}</div>
                        <button
                          type="button"
                          className="text-zinc-500 hover:text-red-600"
                          onClick={() => setSampleRows((rows) => rows.filter((_, idx) => idx !== index))}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="mt-3 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                    onClick={() => setSampleRows((rows) => [...rows, { amount: 500, feePercentage: houseFee }])}
                  >
                    Add sample row
                  </button>
                </div>
              </div>
              <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Example: ETB 500 = house fee ETB 100</div>
              <div className="mt-6 flex gap-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowHouseFeeModal(false)} disabled={busy}>Cancel</button>
                <button type="button" className="btn-primary flex-1" onClick={applyHouseFee} disabled={busy}>Apply Fee</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
