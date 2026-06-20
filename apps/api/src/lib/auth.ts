import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { jwt } from "better-auth/plugins";
import { bearer } from "better-auth/plugins";
import { prisma } from "@pocketvault/db";
import { randomUUID } from "crypto";
import { requireEnv } from "./env.js";
import { AUTH_CONSTANTS } from "./constants.js";

const WEB_ORIGIN = requireEnv("WEB_ORIGIN");

function generateOrgSlug(email: string): string {
  const username = email.split("@")[0];
  return `${username!.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;
}

function generateOrgName(email: string): string {
  return `${email.split("@")[0]}'s Vault`;
}

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
      jwks: {
        keyPairConfig: { alg: "ES256" },
      },
      jwt: {
        expirationTime: AUTH_CONSTANTS.JWT_EXPIRATION,
        definePayload: ({ user }) => ({
          userId: user.id,
          email: user.email,
          organizationId:
            (user as typeof user & { organizationId?: string })
              .organizationId ?? null,
        }),
      },
    }),
    bearer(),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const orgName = generateOrgName(user.email as string);
          const orgSlug = generateOrgSlug(user.email as string);

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
                  role: AUTH_CONSTANTS.DEFAULT_USER_ROLE,
                  createdAt: new Date(),
                },
              },
            },
          });

          await prisma.user.update({
            where: { id: user.id },
            data: { organizationId: org.id },
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
              role: AUTH_CONSTANTS.DEFAULT_USER_ROLE,
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
