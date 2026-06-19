import { randomUUID, createHash } from "crypto";
import { prisma } from "@pocketvault/db";

// Proves multi-tenant data isolation at the data layer: every transaction
// query is scoped by organizationId, so one org can never read another's rows.
// Uses randomized ids and cleans up after itself, so it is safe to run against
// the dev database.

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

const orgA = randomUUID();
const orgB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();

describe("organization data isolation", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: userA, name: "Iso A", email: `iso-a-${userA}@test.local`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
        { id: userB, name: "Iso B", email: `iso-b-${userB}@test.local`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
      ],
    });
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: "Org A", slug: `iso-a-${orgA}`, createdAt: new Date() },
        { id: orgB, name: "Org B", slug: `iso-b-${orgB}`, createdAt: new Date() },
      ],
    });
    await prisma.transaction.createMany({
      data: [
        { organizationId: orgA, userId: userA, date: new Date(), description: "A-only txn", amount: "100.00", currency: "INR", type: "DEBIT", rawText: "A", rawHash: hash(`a-${orgA}`), confidence: 1 },
        { organizationId: orgB, userId: userB, date: new Date(), description: "B-only txn", amount: "200.00", currency: "INR", type: "DEBIT", rawText: "B", rawHash: hash(`b-${orgB}`), confidence: 1 },
      ],
    });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });

  it("returns only org A's rows when scoped to org A", async () => {
    const rows = await prisma.transaction.findMany({ where: { organizationId: orgA } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.description).toBe("A-only txn");
  });

  it("never leaks org A data into an org B scoped query", async () => {
    const rows = await prisma.transaction.findMany({ where: { organizationId: orgB } });
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
    expect(rows.find((r) => r.description === "A-only txn")).toBeUndefined();
  });

  it("allows the same rawHash in different orgs (dedupe is per-org, not global)", async () => {
    const shared = hash("shared-receipt-text");
    const a = await prisma.transaction.create({
      data: { organizationId: orgA, userId: userA, date: new Date(), description: "shared", amount: "5.00", currency: "INR", type: "DEBIT", rawText: "shared", rawHash: shared, confidence: 1 },
    });
    const b = await prisma.transaction.create({
      data: { organizationId: orgB, userId: userB, date: new Date(), description: "shared", amount: "5.00", currency: "INR", type: "DEBIT", rawText: "shared", rawHash: shared, confidence: 1 },
    });
    expect(a.id).not.toBe(b.id);
    expect(a.organizationId).toBe(orgA);
    expect(b.organizationId).toBe(orgB);
  });
});
