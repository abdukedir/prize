"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageShell } from "@/components/page-shell";
import { api } from "@/lib/client";
import { Language, useI18n } from "@/lib/i18n";
import { employeeSchema } from "@/lib/validators";

type Employee = { id: string; name: string; email: string; disabled: boolean; createdAt: string };
type FormData = z.infer<typeof employeeSchema>;

const dateLocales: Record<Language, string> = {
  en: "en-US",
  am: "am-ET",
  om: "om-ET"
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<Employee | null>(null);
  const { language, t } = useI18n();
  const formatDate = (value: string) => new Intl.DateTimeFormat(dateLocales[language], { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const form = useForm<FormData>({ resolver: zodResolver(employeeSchema), defaultValues: { name: "", email: "", password: "" } });

  function load() {
    api<{ employees: Employee[] }>("/api/employees")
      .then((data) => setEmployees(data.employees))
      .catch(() => toast.error(t("couldNotLoadEmployees")));
  }

  useEffect(load, [t]);

  async function save(values: FormData) {
    try {
      const body = editing && !values.password ? { name: values.name, email: values.email } : values;
      await api(editing ? `/api/employees/${editing.id}` : "/api/employees", { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      toast.success(editing ? t("employeeUpdated") : t("employeeCreated"));
      setEditing(null);
      form.reset({ name: "", email: "", password: "" });
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    }
  }

  async function toggle(employee: Employee) {
    await api(`/api/employees/${employee.id}`, { method: "PUT", body: JSON.stringify({ disabled: !employee.disabled }) });
    toast.success(employee.disabled ? t("employeeEnabled") : t("employeeDisabled"));
    load();
  }

  async function remove(employee: Employee) {
    if (!confirm(t("deleteEmployeeConfirm", { email: employee.email }))) return;
    await api(`/api/employees/${employee.id}`, { method: "DELETE" });
    toast.success(t("employeeDeleted"));
    load();
  }

  return (
    <PageShell>
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="panel p-4">
          <h1 className="text-xl font-bold">{editing ? t("editEmployee") : t("addEmployee")}</h1>
          <form className="mt-5 space-y-4" onSubmit={form.handleSubmit(save)}>
            <label className="block text-sm font-medium">{t("name")}<input className="mt-2" {...form.register("name")} /></label>
            <label className="block text-sm font-medium">{t("email")}<input className="mt-2" type="email" {...form.register("email")} /></label>
            <label className="block text-sm font-medium">{t("password")}<input className="mt-2" type="password" placeholder={editing ? t("keepPassword") : ""} {...form.register("password")} /></label>
            <button className="btn-primary w-full" disabled={form.formState.isSubmitting}><Plus size={17} />{t("saveEmployee")}</button>
          </form>
        </section>
        <section className="panel overflow-hidden">
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="font-semibold">{t("employees")}</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="table-head"><tr><th className="px-4 py-3">{t("name")}</th><th className="px-4 py-3">{t("email")}</th><th className="px-4 py-3">{t("status")}</th><th className="px-4 py-3">{t("created")}</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3 font-medium">{employee.name}</td>
                  <td className="px-4 py-3">{employee.email}</td>
                  <td className="px-4 py-3">{employee.disabled ? t("disabled") : t("active")}</td>
                  <td className="px-4 py-3 text-zinc-500">{formatDate(employee.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary !px-3" title={t("edit")} onClick={() => { setEditing(employee); form.reset({ name: employee.name, email: employee.email, password: "" }); }}><Pencil size={16} /></button>
                      <button className="btn-secondary !px-3" title={t("enableDisable")} onClick={() => toggle(employee)}><Power size={16} /></button>
                      <button className="btn-danger !px-3" title={t("delete")} onClick={() => remove(employee)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </PageShell>
  );
}
