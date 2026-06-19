import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { jwt } from "better-auth/plugins";
import { bearer } from "better-auth/plugins";
import { prisma } from "@pocketvault/db";
import { randomUUID } from "crypto";
import { requireEnv } from "./env.js";

const WEB_ORIGIN = requireEnv("WEB_ORIGIN");

export const auth = betterAuth({
  baseURL: requireEnv("BETTER_AUTH_URL"),
  secret: requireEnv("BETTER_AUTH_SECRET"),
  trustedOrigins: [WEB_ORIGIN],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
  },
  user: {
    additionalFields: {
      organizationId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  plugins: [
    organization({
      teams: {
        enabled: true,
      },
    }),
    jwt({
      // ES256 (not the EdDSA default) — hono/jwk verifies it reliably.
      jwks: {
        keyPairConfig: { alg: "ES256" },
      },
      jwt: {
        expirationTime: "7d",
        definePayload: ({ user }) => ({
          userId: user.id,
          email: user.email,
          organizationId: (user as typeof user & { organizationId?: string }).organizationId ?? null,
        }),
      },
    }),
    bearer(),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const orgName = `${(user.email as string).split("@")[0]}'s Vault`;
          const orgSlug = `${(user.email as string).split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;

          const org = await prisma.organization.create({
            data: {
              id: randomUUID(),
              name: orgName,
              slug: orgSlug,
              createdAt: new Date(),
              members: {
                create: {
                  id: randomUUID(),
                  userId: user.id,
                  role: "owner",
                  createdAt: new Date(),
                },
              },
            },
          });

          await prisma.user.update({
            where: { id: user.id },
            data: { organizationId: org.id } as never,
          });
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const membership = await prisma.member.findFirst({
            where: {
              userId: session.userId,
              role: "owner",
            },
            orderBy: { createdAt: "asc" },
          });

          return {
            data: {
              ...session,
              activeOrganizationId: membership?.organizationId ?? null,
            },
          };
        },
      },
    },
  },
});

export type Auth = typeof auth;
