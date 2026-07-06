import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { RATE_LIMIT_CONSTANTS } from "./constants.js";

type ExtractEnv = { Variables: { jwtPayload?: { userId?: string } } };

// TRUSTED_PROXIES can be set as a comma-separated list of trusted proxy IPs/CIDRs.
// When set, x-forwarded-for is only trusted if the direct peer is in the list,
// preventing clients from spoofing the header to bypass rate limiting.
const TRUSTED_PROXIES = process.env.TRUSTED_PROXIES
  ? new Set(process.env.TRUSTED_PROXIES.split(",").map((s) => s.trim()))
  : null;

function clientIp(c: Context): string {
  const peerIp = c.req.header("x-real-ip") ?? "local";
  const fwd = c.req.header("x-forwarded-for");

  // Only trust x-forwarded-for when the direct connection comes from a known proxy
  if (fwd && (TRUSTED_PROXIES === null || TRUSTED_PROXIES.has(peerIp))) {
    return fwd.split(",")[0]!.trim();
  }

  return peerIp;
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
