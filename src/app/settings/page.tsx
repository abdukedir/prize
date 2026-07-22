"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/auth-guard";
import { api, money } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import { activeLanguages } from "@/lib/language-options";
import { settingsSchema } from "@/lib/validators";

type Tier = { minAmount: number; feePercentage: number };
type FormData = z.infer<typeof settingsSchema>;

export default function SettingsPage() {
  const { user, loading } = useMe();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [showHouseFeeModal, setShowHouseFeeModal] = useState(false);
  const [defaultFeePercentage, setDefaultFeePercentage] = useState(10);
  const [tiers, setTiers] = useState<Tier[]>([{ minAmount: 500, feePercentage: 10 }]);
  const form = useForm<FormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { ticketPrice: 200, firstPrize: 1000, secondPrize: 200, winnerRate: 200, currency: "ETB", language: "en", theme: "light", adminFeePercentage: 10 }
  });
  const ticketPrice = form.watch("ticketPrice");
  const winnerRate = form.watch("winnerRate");
  const currency = form.watch("currency");

  useEffect(() => {
    api<{ settings: FormData & { houseFeeTiers?: Tier[]; adminFeePercentage?: number } }>("/api/settings")
      .then((data) => {
        form.reset(data.settings);
        setDefaultFeePercentage(data.settings.adminFeePercentage ?? 10);
        if (data.settings.houseFeeTiers && data.settings.houseFeeTiers.length > 0) {
          setTiers(data.settings.houseFeeTiers);
        }
      })
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

  async function applyHouseFee() {
    const invalid = tiers.find((tier) => tier.minAmount < 1 || tier.feePercentage < 0 || tier.feePercentage > 100);
    if (invalid) {
      return toast.error("Enter valid tiers: min amount >= 1, fee between 0 and 100");
    }
    if (defaultFeePercentage < 0 || defaultFeePercentage > 100) {
      return toast.error("Enter a valid default fee between 0 and 100");
    }

    try {
      setBusy(true);
      const currentValues = form.getValues();
      const updatedValues = { ...currentValues, adminFeePercentage: defaultFeePercentage, houseFeeTiers: tiers };
      await api("/api/settings", { method: "PUT", body: JSON.stringify(updatedValues) });
      form.reset(updatedValues);
      setShowHouseFeeModal(false);
      toast.success("House fee tiers updated");
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
            <div className="text-sm text-zinc-600 dark:text-zinc-300">{tiers.length} fee tier{tiers.length === 1 ? "" : "s"} configured</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowHouseFeeModal(true)}>Set House Fee</button>
              <button className="btn-primary" disabled={form.formState.isSubmitting}><Save size={16} />{t("saveSettings")}</button>
            </div>
          </div>
        </form>
        {showHouseFeeModal && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="panel w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold">Set House Fee Tiers</h2>
                <button type="button" className="btn-secondary !h-9 !px-2" onClick={() => setShowHouseFeeModal(false)} disabled={busy}>Cancel</button>
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Fee is selected by the highest minAmount that is less than or equal to the bet amount. If no tier matches, the default fee is used.</p>
              <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <label className="block text-sm font-medium">Default house fee (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={defaultFeePercentage}
                  onChange={(event) => setDefaultFeePercentage(Number(event.target.value))}
                  className="mt-2 h-8 w-32 rounded-md border border-zinc-200 px-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                />
                <p className="mt-1 text-xs text-zinc-500">Applied when no tier minAmount is less than or equal to the bet amount.</p>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500">Min Bet Amount</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500">Fee %</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500">Example Fee</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {tiers.map((tier, index) => {
                      const exampleFee = (5000 * tier.feePercentage) / 100;
                      return (
                        <tr key={index}>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={1}
                              step={500}
                              value={tier.minAmount}
                              onChange={(event) => setTiers((rows) => rows.map((item, idx) => idx === index ? { ...item, minAmount: Number(event.target.value) } : item))}
                              className="h-8 w-32 rounded-md border border-zinc-200 px-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={tier.feePercentage}
                              onChange={(event) => setTiers((rows) => rows.map((item, idx) => idx === index ? { ...item, feePercentage: Number(event.target.value) } : item))}
                              className="h-8 w-24 rounded-md border border-zinc-200 px-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300">ETB {exampleFee.toLocaleString()} on 5K</td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" className="text-xs text-red-600 hover:text-red-800" onClick={() => setTiers((rows) => rows.filter((_, idx) => idx !== index))}>Remove</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="mt-3 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                onClick={() => setTiers((rows) => [...rows, { minAmount: 500, feePercentage: 10 }])}
              >
                Add tier
              </button>
              <div className="mt-6 flex gap-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowHouseFeeModal(false)} disabled={busy}>Cancel</button>
                <button type="button" className="btn-primary flex-1" onClick={applyHouseFee} disabled={busy}>Apply Tiers</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
