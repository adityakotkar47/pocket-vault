import { createHash } from "crypto";
// Importing the db client first runs dotenv/config, so env vars are loaded
// before ./lib/auth.js evaluates its required-env checks.
import { prisma } from "@pocketvault/db";
import { auth } from "./lib/auth.js";
import { parseTransaction } from "./lib/parser.js";

// Seeded users share one password for easy local testing / demo.
const PASSWORD = "password123";

const USERS = [
  { email: "alice@pocketvault.local", name: "Alice Chen" },
  { email: "bob@pocketvault.local", name: "Bob Sharma" },
];

const SAMPLE_TEXTS = [
  `Date: 11 Dec 2025
Description: STARBUCKS COFFEE MUMBAI
Amount: -420.00
Balance after transaction: 18,420.50`,
  `Uber Ride * Airport Drop
12/11/2025 → ₹1,250.00 debited
Available Balance → ₹17,170.50`,
  `txn123 2025-12-10 Amazon.in Order #403-1234567-8901234 ₹2,999.00 Dr Bal 14171.50 Shopping`,
];

function hashText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

async function ensureUser(email: string, name: string) {
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    console.log(`  ↳ ${email} already exists — skipping signup`);
    return existing;
  }

  // Go through Better Auth so the password is hashed identically to a real
  // signup and the user.create hook provisions the organization.
  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });

  const created = await prisma.user.findFirst({ where: { email } });
  if (!created) throw new Error(`Sign-up did not create a user for ${email}`);
  console.log(`  ✓ created ${email}`);
  return created;
}

async function seed() {
  console.log("🌱  Seeding PocketVault…");

  for (const u of USERS) {
    const user = await ensureUser(u.email, u.name);
    const organizationId = (user as { organizationId?: string | null }).organizationId;
    if (!organizationId) {
      throw new Error(`No organization provisioned for ${u.email}`);
    }

    for (const rawText of SAMPLE_TEXTS) {
      const rawHash = hashText(rawText);
      const parsed = parseTransaction(rawText);
      if (parsed.amount === null) continue;

      await prisma.transaction.upsert({
        where: { organizationId_rawHash: { organizationId, rawHash } },
        update: {},
        create: {
          organizationId,
          userId: user.id,
          date: parsed.date ?? new Date(),
          description: parsed.description ?? "Unknown transaction",
          amount: parsed.amount,
          currency: parsed.currency,
          type: parsed.type ?? "DEBIT",
          balanceAfter: parsed.balanceAfter,
          category: parsed.category,
          rawText,
          rawHash,
          confidence: parsed.confidence,
        },
      });
    }

    console.log(`  ✓ ${u.email} → org ${organizationId} (${SAMPLE_TEXTS.length} transactions)`);
  }

  console.log(`✅  Seed complete. Log in with any seeded email + password "${PASSWORD}".`);
  await prisma.$disconnect();
}

seed().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
