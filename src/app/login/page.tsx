"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import { loginSchema } from "@/lib/validators";

type FormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useI18n();
  const form = useForm<FormData>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: FormData) {
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify(values) });
      toast.success(t("welcomeBack"));
      router.replace(params.get("next") || "/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("loginFailed"));
    }
  }

  return (
    <main className="grid min-h-screen bg-paper dark:bg-zinc-950 lg:grid-cols-[1fr_520px]">
      <section className="hidden border-r border-zinc-200 p-10 dark:border-zinc-800 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-mint font-bold text-ink">P</div>
          <div>
            <p className="font-bold">PrizeOps</p>
            <p className="text-sm text-zinc-500">{t("prizeOpsSubtitle")}</p>
          </div>
        </div>
        <div className="max-w-xl">
          <h1 className="text-5xl font-bold leading-tight text-ink dark:text-zinc-50">{t("loginHeroTitle")}</h1>
          <p className="mt-5 text-lg text-zinc-600 dark:text-zinc-400">
            {t("loginHeroText")}
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center p-5">
        <form onSubmit={form.handleSubmit(onSubmit)} className="panel w-full max-w-md p-6">
          <h2 className="text-2xl font-bold">{t("signIn")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("signInHint")}</p>
          <label className="mt-6 block text-sm font-medium">
            {t("email")}
            <div className="relative mt-2">
              <Mail className="absolute left-3 top-2.5 text-zinc-400" size={17} />
              <input className="pl-10" type="email" {...form.register("email")} />
            </div>
          </label>
          <label className="mt-4 block text-sm font-medium">
            {t("password")}
            <div className="relative mt-2">
              <Lock className="absolute left-3 top-2.5 text-zinc-400" size={17} />
              <input className="pl-10" type="password" {...form.register("password")} />
            </div>
          </label>
          <button className="btn-primary mt-6 w-full" disabled={form.formState.isSubmitting}>
            {t("signIn")}
          </button>
        </form>
      </section>
    </main>
  );
}
