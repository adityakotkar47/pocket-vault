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

const CURRENCY_SYMBOLS: Record<string, string> = {
  "₹": "INR",
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
};

function extractCurrency(text: string): string {
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) return code;
  }
  return "INR";
}

function parseDate(text: string): Date | null {
  const patterns = [
    /(\d{1,2})\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i,
    /(\d{2})\/(\d{2})\/(\d{4})/,
    /(\d{4})-(\d{2})-(\d{2})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    if (pattern === patterns[0]) {
      const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      };
      const day = parseInt(match[1], 10);
      const monthKey = match[0].replace(/\d+\s+/i, "").substring(0, 3).toLowerCase();
      const monthNum = months[monthKey];
      const year = parseInt(match[2], 10);
      // Use UTC midnight so the stored instant never drifts to an adjacent
      // calendar day based on the server's local timezone.
      if (monthNum !== undefined) return new Date(Date.UTC(year, monthNum, day));
    }

    if (pattern === patterns[1]) {
      const [, dd, mm, yyyy] = match;
      return new Date(Date.UTC(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10)));
    }

    if (pattern === patterns[2]) {
      // ISO date-only strings are already parsed as UTC midnight.
      return new Date(`${match[0]}T00:00:00.000Z`);
    }
  }
  return null;
}

function determineType(text: string): "DEBIT" | "CREDIT" {
  if (/debited|\bdr\b|withdrawal|paid|spent/i.test(text)) return "DEBIT";
  if (/credited|\bcr\b|deposit|received/i.test(text)) return "CREDIT";
  if (/^-/.test(text.replace(/[^-\d]/g, ""))) return "DEBIT";
  return "DEBIT";
}

function parseAmount(text: string): { amount: number | null; type: "DEBIT" | "CREDIT" | null } {
  // Priority 1: Explicit "Amount: -420.00" label
  const labeled = text.match(/[Aa]mount\s*:\s*-?\s*[₹$€£]?\s*([\d,]+\.\d{1,2})/);
  if (labeled) {
    return { amount: parseFloat(labeled[1].replace(/,/g, "")), type: determineType(text) };
  }

  // Priority 2: Currency symbol immediately before amount "₹1,250.00"
  const withSymbol = text.match(/[₹$€£]\s*([\d,]+\.\d{1,2})/);
  if (withSymbol) {
    return { amount: parseFloat(withSymbol[1].replace(/,/g, "")), type: determineType(text) };
  }

  // Priority 3: Decimal number that is NOT part of a date (dd/mm/yyyy or yyyy-mm-dd)
  // Strip dates first, then grab first decimal
  const stripped = text
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\d{2}\/\d{2}\/\d{4}/g, "");
  const decimalMatch = stripped.match(/\b([\d,]{2,}(?:\.\d{1,2}))\b/);
  if (decimalMatch) {
    return { amount: parseFloat(decimalMatch[1].replace(/,/g, "")), type: determineType(text) };
  }

  return { amount: null, type: null };
}

function parseBalance(text: string): number | null {
  const patterns = [
    /[Bb]alance\s+(?:after\s+)?(?:transaction)?:?\s*[₹$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:Available\s+Balance|Bal)\s*[→:]\s*[₹$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /[Bb]al\s+([\d,]+(?:\.\d{1,2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseFloat(match[1].replace(/,/g, ""));
  }
  return null;
}

function parseDescription(text: string): string | null {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

  // Try explicit "Description:" label first
  for (const line of lines) {
    const labeled = line.match(/[Dd]escription\s*:\s*(.+)/);
    if (labeled) return labeled[1].trim();
  }

  // Multi-line: find a line that doesn't look like metadata
  const metaPattern = /^(Date|Amount|Balance|Bal\b|₹|\d{4}-\d{2}|\d{2}\/\d{2})/i;
  const descLine = lines.find((l) => !metaPattern.test(l) && l.length > 4);
  if (descLine) return descLine;

  // Single-line fallback: strip dates, amounts, keywords and extract merchant
  const cleaned = text
    .replace(/txn\w+/gi, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\d{2}\/\d{2}\/\d{4}/g, "")
    .replace(/[₹$€£][\d,]+\.?\d*/g, "")
    .replace(/\b(Dr|Cr|Bal|debited|credited|Balance)\b[\s\d.,]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Extract the first meaningful word-group (likely the merchant)
  const merchantMatch = cleaned.match(/([A-Za-z][A-Za-z0-9\s.*#-]{4,60})/);
  if (merchantMatch) return merchantMatch[1].trim();

  return null;
}

function parseCategory(text: string): string | null {
  const categories: Array<[RegExp, string]> = [
    [/coffee|starbucks|cafe|restaurant|food|swiggy|zomato/i, "Food & Dining"],
    [/uber|ola|cab|ride|taxi|airport/i, "Transport"],
    [/amazon|flipkart|shopping|order/i, "Shopping"],
    [/netflix|spotify|prime|subscription/i, "Entertainment"],
    [/salary|payroll/i, "Income"],
    [/recharge|broadband|electricity|bill|utility/i, "Utilities"],
  ];
  for (const [pattern, category] of categories) {
    if (pattern.test(text)) return category;
  }
  return null;
}

function computeConfidence(parsed: Omit<ParsedTransaction, "confidence">): number {
  const weights = { date: 0.25, amount: 0.35, description: 0.25, balance: 0.15 };
  let score = 0;
  if (parsed.date !== null) score += weights.date;
  if (parsed.amount !== null) score += weights.amount;
  if (parsed.description !== null && parsed.description.length >= 3) score += weights.description;
  if (parsed.balanceAfter !== null) score += weights.balance;
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

  const partial = { date, description, amount, type, balanceAfter, currency, category };
  const confidence = computeConfidence(partial);

  return { ...partial, confidence };
}
