"use server";

import { apiFetch } from "@/lib/api";
import { requireEnv } from "@/lib/env";

type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: string;
  currency: string;
  type: "DEBIT" | "CREDIT";
  balanceAfter: string | null;
  category: string | null;
  confidence: number;
  createdAt: string;
};

type ExtractResult = {
  data: Transaction;
  duplicate: boolean;
  confidence: number;
};

type ListResult = {
  data: Transaction[];
  nextCursor: string | null;
  hasMore: boolean;
};

export async function extractTransaction(text: string, accessToken: string): Promise<ExtractResult> {
  return apiFetch<ExtractResult>("/api/transactions/extract", accessToken, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function listTransactions(
  accessToken: string,
  cursor?: string,
): Promise<ListResult> {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return apiFetch<ListResult>(`/api/transactions?${params.toString()}`, accessToken);
}

export async function registerUser(email: string, password: string, name?: string): Promise<void> {
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
