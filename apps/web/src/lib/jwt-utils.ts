import type { JwtPayload } from "@pocketvault/db";

export class JwtParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwtParseError";
  }
}

export function parseJwtPayload(jwt: string): JwtPayload {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new JwtParseError("Invalid JWT format");
  }

  const rawPayload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");

  try {
    const payload = JSON.parse(
      Buffer.from(rawPayload, "base64").toString("utf-8"),
    ) as Partial<JwtPayload>;

    if (!payload.userId || !payload.organizationId) {
      throw new JwtParseError("Missing required JWT claims");
    }

    return {
      userId: payload.userId,
      organizationId: payload.organizationId,
      email: payload.email,
      sub: payload.sub,
      exp: payload.exp,
    };
  } catch (error) {
    if (error instanceof JwtParseError) throw error;
    throw new JwtParseError("Failed to parse JWT payload");
  }
}

export function calculateTokenExpiry(
  exp?: number,
  fallbackDays: number = 7,
): number {
  if (exp) {
    return exp * 1000;
  }
  return Date.now() + fallbackDays * 24 * 60 * 60 * 1000;
}
