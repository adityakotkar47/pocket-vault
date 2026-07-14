import { Hono } from "hono";
import { jwk } from "hono/jwk";
import { createHash } from "crypto";
import { prisma, withOrgContext } from "@pocketvault/db";
import type { JwtPayload, TransactionData } from "@pocketvault/db";
import { parseTransaction } from "../lib/parser.js";
import { extractLimiter } from "../lib/rate-limit.js";
import { requireEnv } from "../lib/env.js";
import { ERROR_MESSAGES, PAGINATION_CONSTANTS } from "../lib/constants.js";
import { buildCursorCondition, createCursor } from "../lib/cursor-utils.js";

const JWKS_URI = `${requireEnv("BETTER_AUTH_URL")}/api/auth/jwks`;

type Env = { Variables: { jwtPayload: JwtPayload } };

interface SplitPayload {
  text: string;
  user_email?: string;
  pctg?: number;
}

type SplitResponse = {
  userEmail: string;
  percentage: number;
  splitAmount: string | null;
};

type ExtractResponse = {
  data: TransactionData;
  duplicate: boolean;
  confidence: number;
};

function normalizeSplitPayload(payload: unknown): SplitPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<SplitPayload>;
  if (typeof candidate.text !== "string") return null;
  if (
    candidate.user_email !== undefined &&
    typeof candidate.user_email !== "string"
  )
    return null;
  if (candidate.pctg !== undefined && typeof candidate.pctg !== "number")
    return null;
  return {
    text: candidate.text,
    user_email: candidate.user_email,
    pctg: candidate.pctg,
  };
}

function formatDecimal(
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return null;
  return num.toFixed(2);
}

function calculateSplitAmount(amount: string, percentage: number): string {
  const numericAmount = Number(amount);
  return (numericAmount * (percentage / 100)).toFixed(2);
}

async function resolveOrganizationId(payload: JwtPayload): Promise<string | null> {
  const currentUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { organizationId: true },
  });

  return currentUser?.organizationId ?? payload.organizationId ?? null;
}

export const transactionRoutes = new Hono<Env>();

transactionRoutes.use(
  "*",
  jwk({
    jwks_uri: JWKS_URI,
    alg: ["ES256"],
  }),
);

function hashText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

transactionRoutes.post("/extract", extractLimiter, async (c) => {
  const payload = c.get("jwtPayload");
  const { userId, organizationId } = payload;

  const activeOrganizationId = await resolveOrganizationId(payload);

  if (!activeOrganizationId) {
    return c.json({ error: ERROR_MESSAGES.NO_ORGANIZATION }, 403);
  }

  const body = normalizeSplitPayload(await c.req.json());
  if (!body?.text || typeof body.text !== "string") {
    return c.json({ error: ERROR_MESSAGES.INVALID_TEXT_FIELD }, 400);
  }

  const rawText = body.text.trim();
  const rawHash = hashText(rawText);
  const parsed = parseTransaction(rawText);

  if (parsed.amount === null) {
    return c.json(
      {
        error: ERROR_MESSAGES.COULD_NOT_PARSE_AMOUNT,
        confidence: parsed.confidence,
      },
      422,
    );
  }

  const result = await withOrgContext(activeOrganizationId, async (tx) => {
    const existing = await tx.transaction.findUnique({
      where: { organizationId_rawHash: { organizationId: activeOrganizationId, rawHash } },
      select: { id: true },
    });
    let transactionId = existing?.id ?? null;

    if (!transactionId) {
      const created = await tx.transaction.create({
        data: {
          organizationId: activeOrganizationId,
          userId,
          date: parsed.date ?? new Date(),
          description: parsed.description ?? "Unknown transaction",
          amount: parsed.amount!,
          currency: parsed.currency,
          type: parsed.type ?? "DEBIT",
          balanceAfter: parsed.balanceAfter,
          category: parsed.category,
          rawText,
          rawHash,
          confidence: parsed.confidence,
        },
        select: { id: true },
      });
      transactionId = created.id;
    }

    let split: SplitResponse | null = null;
    if (body.user_email && typeof body.pctg === "number") {
      const splitUser = await tx.user.findUnique({
        where: { email: body.user_email },
        select: { id: true, email: true },
      });

      if (splitUser) {
        await tx.splits.upsert({
          where: {
            transactionId_userId: {
              transactionId,
              userId: splitUser.id,
            },
          },
          update: {
            percentage: body.pctg,
          },
          create: {
            transactionId,
            userId: splitUser.id,
            percentage: body.pctg,
          },
        });

        split = {
          userEmail: splitUser.email,
          percentage: body.pctg,
          splitAmount: calculateSplitAmount(
            formatDecimal(parsed.amount) ?? "0.00",
            body.pctg,
          ),
        };
      }
    }

    const transaction = await tx.transaction.findUniqueOrThrow({
      where: { id: transactionId },
      select: {
        id: true,
        user: {
          select: {
            email: true,
          },
        },
        date: true,
        description: true,
        amount: true,
        currency: true,
        type: true,
        balanceAfter: true,
        category: true,
        confidence: true,
        createdAt: true,
      },
    });

    return { existing: !!existing, created: transaction, split };
  });

  const data: TransactionData = {
    id: result.created.id,
    ownerEmail: result.created.user.email,
    date: result.created.date.toISOString(),
    description: result.created.description,
    amount: result.created.amount.toString(),
    currency: result.created.currency,
    type: result.created.type,
    balanceAfter: result.created.balanceAfter?.toString() ?? null,
    category: result.created.category,
    confidence: result.created.confidence,
    createdAt: result.created.createdAt.toISOString(),
    split: result.split,
  };

  const response: ExtractResponse = {
    data,
    duplicate: result.existing,
    confidence: parsed.confidence,
  };

  return c.json(response, result.existing ? 200 : 201);
});

transactionRoutes.get("/", async (c) => {
  const payload = c.get("jwtPayload");
  const activeOrganizationId = await resolveOrganizationId(payload);

  if (!activeOrganizationId) {
    return c.json({ error: ERROR_MESSAGES.NO_ORGANIZATION }, 403);
  }

  const limit = Math.max(
    PAGINATION_CONSTANTS.MIN_LIMIT,
    Math.min(
      parseInt(
        c.req.query("limit") ?? String(PAGINATION_CONSTANTS.DEFAULT_LIMIT),
        10,
      ),
      PAGINATION_CONSTANTS.MAX_LIMIT,
    ),
  );
  const cursor = c.req.query("cursor");

  const cursorCondition = cursor ? buildCursorCondition(cursor) : {};

  const transactions = await withOrgContext(activeOrganizationId, (tx) =>
    tx.transaction.findMany({
      where: {
        organizationId: activeOrganizationId,
        ...cursorCondition,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        user: {
          select: {
            email: true,
          },
        },
        date: true,
        description: true,
        amount: true,
        currency: true,
        type: true,
        balanceAfter: true,
        category: true,
        confidence: true,
        createdAt: true,
        splits: {
          select: {
            percentage: true,
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
    }),
  );

  const transactionItems = transactions.map((transaction) => {
    const { splits, ...baseTransaction } = transaction;
    const split = splits[0];
    const percentage = split?.percentage ?? null;
    const splitAmount =
      split && percentage !== null
        ? calculateSplitAmount(transaction.amount.toString(), percentage)
        : null;

    return {
      ...baseTransaction,
      ownerEmail: transaction.user.email,
      amount: transaction.amount.toString(),
      balanceAfter: transaction.balanceAfter?.toString() ?? null,
      createdAt: transaction.createdAt.toISOString(),
      split: split
        ? {
            userEmail: split.user.email,
            percentage,
            splitAmount,
          }
        : null,
    };
  });

  const hasMore = transactionItems.length > limit;
  const items = hasMore ? transactionItems.slice(0, limit) : transactionItems;

  const nextCursor =
    hasMore && items.length > 0
      ? createCursor(
          items[items.length - 1]!.createdAt,
          items[items.length - 1]!.id,
        )
      : null;

  return c.json({ data: items.slice(0, limit), nextCursor, hasMore });
});
