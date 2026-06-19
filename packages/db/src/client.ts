import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export * from "./generated/prisma/client.js";

const globalForPrisma = globalThis as unknown as { prisma: InstanceType<typeof PrismaClient> };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

type ITXClient = Omit<
  InstanceType<typeof PrismaClient>,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Wraps one or more Prisma queries in an interactive transaction that first
 * sets the `app.organization_id` session-local variable.  The Postgres
 * Row-Level Security policy on the `transaction` table reads this variable, so
 * only rows belonging to the declared organisation are visible or writable.
 *
 * Usage:
 *   const rows = await withOrgContext(orgId, (tx) =>
 *     tx.transaction.findMany({ where: { organizationId: orgId } })
 *   );
 */
export async function withOrgContext<T>(
  organizationId: string,
  fn: (tx: ITXClient) => Promise<T>,
): Promise<T> {
  if (!organizationId) {
    throw new Error("withOrgContext requires a non-empty organizationId");
  }
  return prisma.$transaction(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx as any).$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, TRUE)`;
    return fn(tx as unknown as ITXClient);
  });
}
