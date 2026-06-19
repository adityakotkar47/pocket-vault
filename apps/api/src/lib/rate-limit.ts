import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";

type ExtractEnv = { Variables: { jwtPayload?: { userId?: string } } };

// Behind a proxy (Railway/Vercel) the real client IP arrives in x-forwarded-for.
// Locally there is no proxy, so all requests collapse to a single "local" key —
// the limit still works, it's just global for dev.
function clientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? "local";
}

// Pre-auth endpoints (register/login): keyed by client IP to blunt signup spam
// and credential-stuffing. Shared store => combined budget per IP across both.
export const authLimiter = rateLimiter({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-6",
  keyGenerator: clientIp,
  handler: (c) =>
    c.json({ error: "Too many attempts. Please wait a minute and try again." }, 429),
});

// Extract endpoint: keyed by the authenticated user (organisation-isolated),
// so one tenant can't exhaust another's budget. Runs after the JWK middleware.
export const extractLimiter = rateLimiter<ExtractEnv>({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-6",
  keyGenerator: (c) => c.get("jwtPayload")?.userId ?? clientIp(c),
  handler: (c) =>
    c.json(
      { error: "Too many requests. Please wait before extracting more transactions." },
      429,
    ),
});
