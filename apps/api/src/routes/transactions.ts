import { Hono } from "hono";
import { jwk } from "hono/jwk";
import { createHash } from "crypto";
import { withOrgContext } from "@pocketvault/db";
import type { JwtPayload } from "@pocketvault/db";
import { parseTransaction } from "../lib/parser.js";
import { extractLimiter } from "../lib/rate-limit.js";
import { requireEnv } from "../lib/env.js";
import { ERROR_MESSAGES, PAGINATION_CONSTANTS } from "../lib/constants.js";
import { buildCursorCondition, createCursor } from "../lib/cursor-utils.js";

const JWKS_URI = `${requireEnv("BETTER_AUTH_URL")}/api/auth/jwks`;

type Env = { Variables: { jwtPayload: JwtPayload } };

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

  if (!organizationId) {
    return c.json({ error: ERROR_MESSAGES.NO_ORGANIZATION }, 403);
  }

  const body = await c.req.json<{ text: string }>();
  if (!body.text || typeof body.text !== "string") {
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

  const result = await withOrgContext(organizationId, async (tx) => {
    const existing = await tx.transaction.findUnique({
      where: { organizationId_rawHash: { organizationId, rawHash } },
    });
    if (existing) return { existing, created: null };

    const created = await tx.transaction.create({
      data: {
        organizationId,
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
    });
    return { existing: null, created };
  });

  if (result.existing) {
    return c.json({ data: result.existing, duplicate: true }, 200);
  }
  return c.json(
    { data: result.created, duplicate: false, confidence: parsed.confidence },
    201,
  );
});

transactionRoutes.get("/", async (c) => {
  const payload = c.get("jwtPayload");
  const { organizationId } = payload;

  if (!organizationId) {
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

  const transactions = await withOrgContext(organizationId, (tx) =>
    tx.transaction.findMany({
      where: {
        organizationId,
        ...cursorCondition,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
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
    }),
  );

  const hasMore = transactions.length > limit;
  const items = hasMore ? transactions.slice(0, limit) : transactions;

  const nextCursor =
    hasMore && items.length > 0
      ? createCursor(
          items[items.length - 1]!.createdAt,
          items[items.length - 1]!.id,
        )
      : null;

  return c.json({ data: items, nextCursor, hasMore });
});
