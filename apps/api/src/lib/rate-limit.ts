import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { RATE_LIMIT_CONSTANTS } from "./constants.js";

type ExtractEnv = { Variables: { jwtPayload?: { userId?: string } } };

function clientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? "local";
}

export const authLimiter = rateLimiter({
  windowMs: RATE_LIMIT_CONSTANTS.AUTH_WINDOW_MS,
  limit: RATE_LIMIT_CONSTANTS.AUTH_MAX_REQUESTS,
  standardHeaders: "draft-6",
  keyGenerator: clientIp,
  handler: (c) =>
    c.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      429,
    ),
});

export const extractLimiter = rateLimiter<ExtractEnv>({
  windowMs: RATE_LIMIT_CONSTANTS.EXTRACT_WINDOW_MS,
  limit: RATE_LIMIT_CONSTANTS.EXTRACT_MAX_REQUESTS,
  standardHeaders: "draft-6",
  keyGenerator: (c) => c.get("jwtPayload")?.userId ?? clientIp(c),
  handler: (c) =>
    c.json(
      {
        error:
          "Too many requests. Please wait before extracting more transactions.",
      },
      429,
    ),
});
