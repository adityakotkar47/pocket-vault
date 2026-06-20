import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { requireEnv } from "./lib/env";
import {
  parseJwtPayload,
  calculateTokenExpiry,
  JwtParseError,
} from "./lib/jwt-utils";
import { AUTH_CONSTANTS } from "@pocketvault/api/src/lib/constants";

const SESSION_MAX_AGE = AUTH_CONSTANTS.SESSION_MAX_AGE_SECONDS;

class RateLimitError extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
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
          const res = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
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

          try {
            const payload = parseJwtPayload(jwt);

            return {
              id: payload.userId,
              email: String(credentials.email),
              name: data.user?.name ?? String(credentials.email).split("@")[0],
              accessToken: jwt,
              orgId: payload.organizationId,
              accessTokenExpires: calculateTokenExpiry(payload.exp, 7),
            };
          } catch (error) {
            if (error instanceof JwtParseError) {
              console.error("[authorize] JWT parse error:", error.message);
            }
            return null;
          }
        } catch (err) {
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
