"use client";

export type ApiUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: "SUPERADMIN" | "ADMIN" | "EMPLOYEE";
};

export function getCsrfToken() {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith("gpm_csrf="))
    ?.split("=")[1];
}

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("content-type", "application/json");
  if (!["GET", "HEAD"].includes(method.toUpperCase())) {
    const csrf = getCsrfToken();
    if (csrf) headers.set("x-csrf-token", csrf);
  }
  const res = await fetch(url, { ...init, method, headers });
  if (!res.ok) {
    const message = await res.json().catch(async () => ({ error: await res.text().catch(() => res.statusText) }));
    throw new Error(message.error ?? "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function money(value: number, currency = "ETB") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value ?? 0);
}

export function date(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
