"use client";

import { useState, useTransition, useEffect } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
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
import { extractTransaction, listTransactions } from "@/app/actions";

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

function formatAmount(amount: string, currency: string, type: "DEBIT" | "CREDIT") {
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

export function Dashboard({ accessToken }: { accessToken: string }) {
  const [rawText, setRawText] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isParsing, startParsing] = useTransition();
  const [isLoading, startLoading] = useTransition();

  async function handleLoad(cursor?: string) {
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
        toast.error(err instanceof Error ? err.message : "Failed to load transactions");
      }
    });
  }

  async function handleExtract() {
    if (!rawText.trim()) {
      toast.error("Please paste some transaction text first");
      return;
    }
    startParsing(async () => {
      try {
        const result = await extractTransaction(rawText, accessToken);
        if (result.duplicate) {
          toast.info("Duplicate transaction — already saved");
        } else {
          toast.success(`Saved! Confidence: ${Math.round(result.confidence * 100)}%`);
          setTransactions((prev) => [result.data, ...prev]);
        }
        setRawText("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Extraction failed");
      }
    });
  }

  useEffect(() => {
    handleLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">PocketVault</h1>
          <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
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
            <Button onClick={handleExtract} disabled={isParsing} className="w-full sm:w-auto">
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
                No transactions yet. Paste some bank statement text above to get started.
              </p>
            ) : (
              <>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
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
                          <TableCell>
                            {txn.category ? (
                              <Badge variant="secondary" className="text-xs">
                                {txn.category}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono text-sm font-medium ${
                              txn.type === "DEBIT" ? "text-destructive" : "text-green-600"
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
