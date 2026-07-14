"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import type { TransactionData } from "@pocketvault/db";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractTransaction, listTransactions } from "@/app/actions";

function formatAmount(
  amount: string,
  currency: string,
  type: "DEBIT" | "CREDIT",
) {
  const num = parseFloat(amount);
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(num);
  return type === "DEBIT" ? `-${formatted}` : `+${formatted}`;
}

function formatBalance(balance: string | null, currency: string) {
  if (balance === null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(parseFloat(balance));
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatSplitAmount(amount: string | null, currency: string) {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

function getViewerSplitPercentage(
  txn: TransactionData,
  currentUserEmail?: string,
): number | null {
  if (!txn.split) return null;
  const percentage = txn.split.percentage;
  if (percentage === null) return null;
  if (!currentUserEmail) return 100 - percentage;
  return txn.split.userEmail.toLowerCase() === currentUserEmail.toLowerCase()
    ? percentage
    : 100 - percentage;
}

function getSplitWithEmail(
  txn: TransactionData,
  currentUserEmail?: string,
): string {
  if (!txn.split) return "—";

  const ownerEmail = txn.ownerEmail.toLowerCase();
  const splitUserEmail = txn.split.userEmail.toLowerCase();
  const viewerEmail = currentUserEmail?.toLowerCase();

  if (viewerEmail === ownerEmail) {
    return txn.split.userEmail;
  }

  if (viewerEmail === splitUserEmail) {
    return txn.ownerEmail;
  }

  return txn.split.userEmail;
}

function getViewerSplitAmount(
  txn: TransactionData,
  currentUserEmail?: string,
): string | null {
  const percentage = getViewerSplitPercentage(txn, currentUserEmail);
  if (percentage === null) return null;

  const amount = Number(txn.amount);
  if (!Number.isFinite(amount)) return null;

  return (amount * (percentage / 100)).toFixed(2);
}

export function Dashboard({
  accessToken,
  currentUserEmail,
}: {
  accessToken: string;
  currentUserEmail?: string;
}) {
  const [rawText, setRawText] = useState("");
  const [splitUserEmail, setSplitUserEmail] = useState("");
  const [splitPctg, setSplitPctg] = useState("");
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isParsing, startParsing] = useTransition();
  const [isLoading, startLoading] = useTransition();

  const handleLoad = useCallback(
    async (cursor?: string) => {
      startLoading(async () => {
        try {
          const result = await listTransactions(accessToken, cursor);
          if (cursor) {
            setTransactions((prev) => [...prev, ...result.data]);
          } else {
            setTransactions(result.data);
          }
          setNextCursor(result.nextCursor);
          setHasMore(result.hasMore);
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Failed to load transactions",
          );
        }
      });
    },
    [accessToken, startLoading],
  );

  async function handleExtract() {
    if (!rawText.trim()) {
      toast.error("Please paste some transaction text first");
      return;
    }
    startParsing(async () => {
      try {
        const splitUser = splitUserEmail.trim();
        const splitPercentage =
          splitPctg.trim() === "" ? null : Number(splitPctg);
        const splitInput =
          splitUser.length > 0 &&
          splitPercentage !== null &&
          Number.isFinite(splitPercentage)
            ? {
                userEmail: splitUser,
                pctg: splitPercentage,
              }
            : undefined;

        const result = await extractTransaction(
          rawText,
          accessToken,
          splitInput,
        );

        if (result.duplicate) {
          toast.info("Duplicate transaction — already saved");
        } else {
          toast.success(
            `Saved! Confidence: ${Math.round(result.confidence * 100)}%`,
          );
          setTransactions((prev) => [result.data, ...prev]);
        }
        setRawText("");
        setSplitUserEmail("");
        setSplitPctg("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Extraction failed");
      }
    });
  }

  useEffect(() => {
    handleLoad();
  }, [handleLoad]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">PocketVault</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Extract Transaction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              rows={8}
              className="w-full min-h-[200px] rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y font-mono"
              placeholder={`Paste raw bank statement text here…\n\nExample:\nDate: 11 Dec 2025\nDescription: STARBUCKS COFFEE MUMBAI\nAmount: -420.00\nBalance after transaction: 18,420.50`}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="split-user-email">Split with email</Label>
                <Input
                  id="split-user-email"
                  type="email"
                  placeholder="teammate@example.com"
                  value={splitUserEmail}
                  onChange={(e) => setSplitUserEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="split-pctg">Split percentage</Label>
                <Input
                  id="split-pctg"
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  placeholder="25"
                  value={splitPctg}
                  onChange={(e) => setSplitPctg(e.target.value)}
                />
              </div>
            </div>
            <Button
              onClick={handleExtract}
              disabled={isParsing}
              className="w-full sm:w-auto"
            >
              {isParsing ? "Parsing & saving…" : "Parse & Save"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && transactions.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                No transactions yet. Paste some bank statement text above to get
                started.
              </p>
            ) : (
              <>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Split With</TableHead>
                        <TableHead className="text-right">Your Split</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="text-right">Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((txn) => (
                        <TableRow key={txn.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDate(txn.date)}
                          </TableCell>
                          <TableCell className="max-w-[240px] truncate text-sm">
                            {txn.description}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                            {getSplitWithEmail(txn, currentUserEmail)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">
                            {formatSplitAmount(
                              getViewerSplitAmount(txn, currentUserEmail),
                              txn.currency,
                            )}
                          </TableCell>
                          <TableCell>
                            {txn.category ? (
                              <Badge variant="secondary" className="text-xs">
                                {txn.category}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono text-sm font-medium ${
                              txn.type === "DEBIT"
                                ? "text-destructive"
                                : "text-green-600"
                            }`}
                          >
                            {formatAmount(txn.amount, txn.currency, txn.type)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {formatBalance(txn.balanceAfter, txn.currency)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {Math.round(txn.confidence * 100)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {hasMore && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="outline"
                      onClick={() => handleLoad(nextCursor ?? undefined)}
                      disabled={isLoading}
                    >
                      {isLoading ? "Loading…" : "Load more"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
