"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import { bootstrapSchema } from "@/lib/validators";

type FormData = z.infer<typeof bootstrapSchema>;

export default function SetupPage() {
  const router = useRouter();
  const { t } = useI18n();
  const form = useForm<FormData>({
    resolver: zodResolver(bootstrapSchema),
    defaultValues: { tenantName: "", name: "", email: "", password: "" }
  });

  async function onSubmit(values: FormData) {
    try {
      await api("/api/auth/bootstrap", { method: "POST", body: JSON.stringify(values) });
      toast.success(t("workspaceCreated"));
      router.replace("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("setupFailed"));
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper p-5 dark:bg-zinc-950">
      <form onSubmit={form.handleSubmit(onSubmit)} className="panel w-full max-w-xl p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-mint text-ink">
            <Building2 size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("createWorkspaceTitle")}</h1>
            <p className="text-sm text-zinc-500">{t("createWorkspaceHint")}</p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium sm:col-span-2">
            {t("organizationName")}
            <input className="mt-2" {...form.register("tenantName")} />
          </label>
          <label className="block text-sm font-medium">
            {t("adminName")}
            <input className="mt-2" {...form.register("name")} />
          </label>
          <label className="block text-sm font-medium">
            {t("adminEmail")}
            <input className="mt-2" type="email" {...form.register("email")} />
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            {t("password")}
            <input className="mt-2" type="password" {...form.register("password")} />
          </label>
        </div>
        <button className="btn-primary mt-6 w-full" disabled={form.formState.isSubmitting}>
          <UserRoundPlus size={17} />
          {t("createWorkspace")}
        </button>
      </form>
    </main>
  );
}
