"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, ChevronDown, Gamepad2, LogOut, Moon, Settings, Shield, Split, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiUser, api } from "@/lib/client";
import { Language, useI18n } from "@/lib/i18n";
import { activeLanguages } from "@/lib/language-options";

const nav = [
  { href: "/dashboard", labelKey: "games", icon: Gamepad2 },
  { href: "/games/numbers", labelKey: "numbers", icon: Shield },
  { href: "/games/even-odd", labelKey: "evenOdd", icon: Split }
];

export function AppShell({ user, children }: { user: ApiUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [language, setLanguage] = useState("en");
  const { t } = useI18n();

  useEffect(() => {
    async function loadSettings() {
      const fallbackDark = localStorage.getItem("theme") === "dark";
      try {
        const res = await api<{ settings: { theme: string; language: string } }>("/api/settings");
        const nextDark = res.settings.theme === "dark";
        setLanguage(res.settings.language);
        setDark(nextDark);
        document.documentElement.classList.toggle("dark", nextDark);
      } catch {
        setDark(fallbackDark);
        document.documentElement.classList.toggle("dark", fallbackDark);
      }
    }
    loadSettings();
  }, []);

  async function updatePreference(next: { theme?: string; language?: string }) {
    try {
      const current = await api<{ settings: Record<string, unknown> }>("/api/settings");
      await api("/api/settings", { method: "PUT", body: JSON.stringify({ ...current.settings, ...next }) });
    } catch {
      toast.error(t("couldNotSavePreference"));
    }
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
    updatePreference({ theme: next ? "dark" : "light" });
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    toast.success(t("signedOut"));
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-paper text-ink dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="flex min-h-16 flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-zinc-500">{t("employee")}</p>
            <p className="text-sm font-semibold">{user.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard" className="mr-2 flex items-center gap-2 rounded-md px-2 py-1.5">
              <div className="grid h-9 w-9 place-items-center rounded-md bg-emerald-500 text-white shadow-sm">
                <Shield size={18} />
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-bold">EthioBet Ops</p>
                <p className="text-xs text-zinc-500">{t("lotteryManagement")}</p>
              </div>
            </Link>
            <div className="relative">
              <select
                className="h-10 appearance-none pr-9"
                value={language}
                onChange={(event) => {
                  const nextLanguage = event.target.value as Language;
                  setLanguage(nextLanguage);
                  window.dispatchEvent(new CustomEvent("languagechange", { detail: nextLanguage }));
                  updatePreference({ language: nextLanguage });
                }}
              >
                {activeLanguages.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 text-zinc-400" size={15} />
            </div>
            <button className="btn-secondary !h-10 !px-3" onClick={toggleTheme} title={t("toggleTheme")}>
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <Link className="btn-secondary !h-10 !px-3" href="/settings" title={t("settings")}>
              <Settings size={17} />
            </Link>
            <Link className="btn-secondary !h-10 !px-3" href="/reports" title={t("reports")}>
              <BarChart3 size={17} />
            </Link>
            <button className="btn-secondary !h-10 !px-3" onClick={logout} title={t("logout")}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                  active ? "bg-ink text-white dark:bg-emerald-400 dark:text-ink" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                }`}
              >
                <Icon size={16} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
}
