"use server";

import { apiFetch } from "@/lib/api";
import { requireEnv } from "@/lib/env";
import type { ExtractResult, ListResult } from "@pocketvault/db";

export async function extractTransaction(
  text: string,
  accessToken: string,
): Promise<ExtractResult> {
  return apiFetch<ExtractResult>("/api/transactions/extract", accessToken, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function listTransactions(
  accessToken: string,
  cursor?: string,
): Promise<ListResult> {
  const params = new URLSearchParams({ limit: "10" });
  if (cursor) params.set("cursor", cursor);
  return apiFetch<ListResult>(
    `/api/transactions?${params.toString()}`,
    accessToken,
  );
}

export async function registerUser(
  email: string,
  password: string,
  name?: string,
): Promise<void> {
  const res = await fetch(`${requireEnv("API_URL")}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Registration failed");
  }
}
