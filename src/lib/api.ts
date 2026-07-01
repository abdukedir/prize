import { NextRequest, NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";
import { validateCsrf } from "@/lib/auth";

export async function parseJson<T>(req: NextRequest, schema: ZodSchema<T>): Promise<T> {
  const body = await req.json().catch(() => ({}));
  return schema.parse(body);
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function ensureCsrf(req: NextRequest) {
  if (!validateCsrf(req)) throw new Response("Invalid CSRF token", { status: 403 });
}

export function handleError(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Validation failed", details: error.flatten() }, { status: 422 });
  }
  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export function serializeMoney(value: unknown) {
  return Number(value ?? 0);
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((key) => escape(row[key])).join(","))].join("\n");
}
