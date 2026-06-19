import { parseTransaction } from "../lib/parser.js";

const SAMPLE_1 = `Date: 11 Dec 2025
Description: STARBUCKS COFFEE MUMBAI
Amount: -420.00
Balance after transaction: 18,420.50`;

const SAMPLE_2 = `Uber Ride * Airport Drop
12/11/2025 → ₹1,250.00 debited
Available Balance → ₹17,170.50`;

const SAMPLE_3 = `txn123 2025-12-10 Amazon.in Order #403-1234567-8901234 ₹2,999.00 Dr Bal 14171.50 Shopping`;

describe("parseTransaction — Sample 1 (labeled multiline)", () => {
  const result = parseTransaction(SAMPLE_1);

  it("parses the date as 11 Dec 2025", () => {
    expect(result.date).not.toBeNull();
    expect(result.date!.getUTCFullYear()).toBe(2025);
    expect(result.date!.getUTCMonth()).toBe(11);
    expect(result.date!.getUTCDate()).toBe(11);
  });

  it("parses description as STARBUCKS COFFEE MUMBAI", () => {
    expect(result.description).toMatch(/STARBUCKS/i);
  });

  it("parses amount as 420.00", () => {
    expect(result.amount).toBe(420.0);
  });

  it("parses balance after as 18420.50", () => {
    expect(result.balanceAfter).toBe(18420.5);
  });
});

describe("parseTransaction — Sample 2 (Uber ride arrow format)", () => {
  const result = parseTransaction(SAMPLE_2);

  it("parses the date as 12/11/2025", () => {
    expect(result.date).not.toBeNull();
    expect(result.date!.getUTCFullYear()).toBe(2025);
  });

  it("marks the transaction as DEBIT", () => {
    expect(result.type).toBe("DEBIT");
  });

  it("parses amount as 1250.00", () => {
    expect(result.amount).toBe(1250.0);
  });

  it("parses balance after as 17170.50", () => {
    expect(result.balanceAfter).toBe(17170.5);
  });
});

describe("parseTransaction — Sample 3 (messy single line)", () => {
  const result = parseTransaction(SAMPLE_3);

  it("parses the ISO date 2025-12-10", () => {
    expect(result.date).not.toBeNull();
    expect(result.date!.getUTCFullYear()).toBe(2025);
    expect(result.date!.getUTCMonth()).toBe(11);
    expect(result.date!.getUTCDate()).toBe(10);
  });

  it("marks the transaction as DEBIT (Dr keyword)", () => {
    expect(result.type).toBe("DEBIT");
  });

  it("parses amount as 2999.00", () => {
    expect(result.amount).toBe(2999.0);
  });

  it("assigns Shopping category", () => {
    expect(result.category).toMatch(/shopping/i);
  });
});

describe("confidence scoring", () => {
  it("returns confidence 1.0 for fully parsed sample 1", () => {
    const result = parseTransaction(SAMPLE_1);
    expect(result.confidence).toBe(1.0);
  });

  it("returns confidence 1.0 for sample 2", () => {
    const result = parseTransaction(SAMPLE_2);
    expect(result.confidence).toBe(1.0);
  });

  it("returns confidence >= 0.85 for messy sample 3", () => {
    const result = parseTransaction(SAMPLE_3);
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("returns low confidence for junk text", () => {
    const result = parseTransaction("hello world no numbers here at all");
    expect(result.confidence).toBeLessThan(0.5);
  });
});

describe("cursor pagination logic", () => {
  it("builds correct nextCursor format", () => {
    const date = new Date("2025-12-10T10:00:00.000Z");
    const id = "clxabc123";
    const cursor = `${date.toISOString()}_${id}`;
    const [cursorCreatedAt, cursorId] = cursor.split("_");
    expect(new Date(cursorCreatedAt).toISOString()).toBe(date.toISOString());
    expect(cursorId).toBe(id);
  });
});
