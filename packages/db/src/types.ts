export type TransactionData = {
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

export type ExtractResult = {
  data: TransactionData;
  duplicate: boolean;
  confidence: number;
};

export type ListResult = {
  data: TransactionData[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type JwtPayload = {
  userId: string;
  organizationId: string;
  email?: string;
  sub?: string;
  exp?: number;
};

export type CursorParts = {
  createdAt: string;
  id: string;
};
