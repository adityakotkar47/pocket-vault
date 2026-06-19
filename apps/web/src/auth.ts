import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { requireEnv } from "./lib/env";

// Surfaces the API's 429 distinctly so the login page can show a rate-limit
// message instead of the generic "invalid credentials" one. The `code` is
// propagated to the client via the signIn() result.
class RateLimitError extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const API_URL = requireEnv("API_URL");

        try {
          // Single call: the API's /login wrapper authenticates and returns the
          // 7-day ES256 JWT we send on every subsequent request.
          const res = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: credentials.email, password: credentials.password }),
          });

          if (res.status === 429) {
            throw new RateLimitError();
          }

          if (!res.ok) {
            console.error("[authorize] login failed:", res.status);
            return null;
          }

          const data = (await res.json()) as {
            token?: string;
            user?: { id?: string; name?: string };
          };

          const jwt = data.token;
          if (!jwt) {
            console.error("[authorize] No token in /login response");
            return null;
          }

          // Decode payload (no verification needed here — API verifies via JWKS)
          const parts = jwt.split(".");
          if (parts.length !== 3) return null;
          const rawPayload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
          const payload = JSON.parse(Buffer.from(rawPayload, "base64").toString("utf-8")) as {
            userId?: string;
            organizationId?: string;
            exp?: number;
          };

          return {
            id: payload.userId ?? data.user?.id ?? "",
            email: String(credentials.email),
            name: data.user?.name ?? String(credentials.email).split("@")[0],
            accessToken: jwt,
            orgId: payload.organizationId ?? null,
            accessTokenExpires: payload.exp
              ? payload.exp * 1000
              : Date.now() + 7 * 24 * 60 * 60 * 1000,
          };
        } catch (err) {
          // Let intentional sign-in errors (e.g. rate limiting) propagate so
          // their `code` reaches the client; only swallow unexpected ones.
          if (err instanceof CredentialsSignin) throw err;
          console.error("[authorize] Unexpected error:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        const u = user as typeof user & {
          accessToken: string;
          orgId: string;
          accessTokenExpires: number;
        };
        token.accessToken = u.accessToken;
        token.orgId = u.orgId;
        token.accessTokenExpires = u.accessTokenExpires;
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        accessToken: token.accessToken as string | undefined,
        user: {
          ...session.user,
          orgId: token.orgId as string | undefined,
        },
      };
    },
  },
});
