export type ParsedTransaction = {
  date: Date | null;
  description: string | null;
  amount: number | null;
  type: "DEBIT" | "CREDIT" | null;
  balanceAfter: number | null;
  currency: string;
  category: string | null;
  confidence: number;
};

import { PARSER_CONSTANTS } from "./constants.js";

const {
  CURRENCY_SYMBOLS,
  DEFAULT_CURRENCY,
  CONFIDENCE_WEIGHTS,
  MIN_DESCRIPTION_LENGTH,
  MONTH_MAP,
  CATEGORY_PATTERNS,
} = PARSER_CONSTANTS;

const NUMBER = String.raw`[\d,]+(?:\.\d{1,2})?`;
const SYMBOL = String.raw`[₹$€£]`;
const SIGN = String.raw`([+-]?)`;
const MONTHS = String.raw`(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)`;

const DEBIT_KEYWORDS = /debit(?:ed)?|\bdr\b|withdrawal|paid|spent/i;
const CREDIT_KEYWORDS = /credit(?:ed)?|\bcr\b|deposit|received|salary|refund/i;

const BALANCE_CLAUSE_SOURCE = String.raw`(?:avl\.?\s*|available\s+)?bal(?:ance)?\s*(?:after\s+transaction)?\s*[→:]?\s*(?:rs\.?|inr|${SYMBOL})?\s*(${NUMBER})`;
const BALANCE_CLAUSE = new RegExp(BALANCE_CLAUSE_SOURCE, "gi");
const BALANCE_MATCH = new RegExp(BALANCE_CLAUSE_SOURCE, "i");

const AMOUNT_LABELED = new RegExp(
  String.raw`amount\s*:\s*${SIGN}\s*${SYMBOL}?\s*(${NUMBER})`,
  "i",
);
const AMOUNT_WITH_SYMBOL = new RegExp(
  String.raw`${SIGN}\s*${SYMBOL}\s*(${NUMBER})`,
);
const AMOUNT_BARE = new RegExp(String.raw`${SIGN}\s*([\d,]{2,}(?:\.\d{1,2})?)`);

function extractCurrency(text: string): string {
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) return code;
  }
  return DEFAULT_CURRENCY;
}

function monthIndex(token: string): number | undefined {
  return MONTH_MAP[token.slice(0, 3).toLowerCase() as keyof typeof MONTH_MAP];
}

function fullYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function utcDate(year: number, monthIdx: number, day: number): Date | null {
  if (monthIdx < 0 || monthIdx > 11) return null;
  const date = new Date(Date.UTC(fullYear(year), monthIdx, day));
  return isNaN(date.getTime()) ? null : date;
}

function fromNamedMonth(m: RegExpMatchArray): Date | null {
  const month = monthIndex(m[2]);
  return month === undefined ? null : utcDate(+m[3], month, +m[1]);
}

const DATE_PARSERS: Array<{
  pattern: RegExp;
  build: (m: RegExpMatchArray) => Date | null;
}> = [
  {
    pattern: new RegExp(`(\\d{1,2})\\s+(${MONTHS})[a-z]*\\s+(\\d{2,4})`, "i"),
    build: fromNamedMonth,
  },
  {
    pattern: new RegExp(`(\\d{1,2})-(${MONTHS})[a-z]*-(\\d{2,4})`, "i"),
    build: fromNamedMonth,
  },
  {
    pattern: /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,
    build: (m) => utcDate(+m[3], +m[2] - 1, +m[1]),
  },
  {
    pattern: /(\d{4})-(\d{2})-(\d{2})/,
    build: (m) => utcDate(+m[1], +m[2] - 1, +m[3]),
  },
  {
    pattern: /(\d{1,2})-(\d{1,2})-(\d{2,4})/,
    build: (m) => utcDate(+m[3], +m[2] - 1, +m[1]),
  },
];

function parseDate(text: string): Date | null {
  for (const { pattern, build } of DATE_PARSERS) {
    const match = text.match(pattern);
    if (match) {
      const date = build(match);
      if (date) return date;
    }
  }
  return null;
}

function determineType(text: string, signHint?: "+" | "-"): "DEBIT" | "CREDIT" {
  if (signHint === "+") return "CREDIT";
  if (signHint === "-") return "DEBIT";
  if (DEBIT_KEYWORDS.test(text)) return "DEBIT";
  if (CREDIT_KEYWORDS.test(text)) return "CREDIT";
  return "DEBIT";
}

function toNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

function toSign(raw: string): "+" | "-" | undefined {
  return (raw || undefined) as "+" | "-" | undefined;
}

function parseAmount(text: string): {
  amount: number | null;
  type: "DEBIT" | "CREDIT" | null;
} {
  const cleaned = text.replace(BALANCE_CLAUSE, "");

  for (const pattern of [AMOUNT_LABELED, AMOUNT_WITH_SYMBOL]) {
    const match = cleaned.match(pattern);
    if (match) {
      return {
        amount: toNumber(match[2]),
        type: determineType(text, toSign(match[1])),
      };
    }
  }

  const stripped = cleaned
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\d{2}\/\d{2}\/\d{4}/g, "")
    .replace(/\d{1,2}-\d{1,2}-\d{2,4}/g, "")
    .replace(/[*xX]{2,}\d+/g, "")
    .replace(/#[\d-]+/g, "");
  const bare = stripped.match(AMOUNT_BARE);
  if (bare) {
    return {
      amount: toNumber(bare[2]),
      type: determineType(text, toSign(bare[1])),
    };
  }

  return { amount: null, type: null };
}

function parseBalance(text: string): number | null {
  const match = text.match(BALANCE_MATCH);
  return match ? toNumber(match[1]) : null;
}

function parseDescription(text: string): string | null {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const labeled = line.match(/[Dd]escription\s*:\s*(.+)/);
    if (labeled) return labeled[1].trim();
  }

  const metaPattern =
    /^(Date|Amount|Balance|Bal\b|₹|\d{4}-\d{2}|\d{2}\/\d{2})/i;
  const descLine = lines.find((l) => !metaPattern.test(l) && l.length > 4);
  if (descLine) return descLine;

  const cleaned = text
    .replace(/txn\w+/gi, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\d{2}\/\d{2}\/\d{4}/g, "")
    .replace(/[₹$€£][\d,]+\.?\d*/g, "")
    .replace(/\b(Dr|Cr|Bal|debited|credited|Balance)\b[\s\d.,]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const merchantMatch = cleaned.match(/([A-Za-z][A-Za-z0-9\s.*#-]{4,60})/);
  if (merchantMatch) return merchantMatch[1].trim();

  return null;
}

function parseCategory(text: string): string | null {
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return null;
}

function computeConfidence(
  parsed: Omit<ParsedTransaction, "confidence">,
): number {
  let score = 0;
  if (parsed.date !== null) score += CONFIDENCE_WEIGHTS.date;
  if (parsed.amount !== null) score += CONFIDENCE_WEIGHTS.amount;
  if (
    parsed.description !== null &&
    parsed.description.length >= MIN_DESCRIPTION_LENGTH
  )
    score += CONFIDENCE_WEIGHTS.description;
  if (parsed.balanceAfter !== null) score += CONFIDENCE_WEIGHTS.balance;
  return Math.round(score * 100) / 100;
}

export function parseTransaction(rawText: string): ParsedTransaction {
  const text = rawText.trim();
  const currency = extractCurrency(text);
  const date = parseDate(text);
  const { amount, type } = parseAmount(text);
  const balanceAfter = parseBalance(text);
  const description = parseDescription(text);
  const category = parseCategory(text);

  const partial = {
    date,
    description,
    amount,
    type,
    balanceAfter,
    currency,
    category,
  };
  const confidence = computeConfidence(partial);

  return { ...partial, confidence };
}
