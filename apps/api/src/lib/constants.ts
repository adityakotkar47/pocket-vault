export const AUTH_CONSTANTS = {
  JWT_EXPIRATION: "7d",
  SESSION_MAX_AGE_SECONDS: 7 * 24 * 60 * 60,
  DEFAULT_USER_ROLE: "owner" as const,
} as const;

export const RATE_LIMIT_CONSTANTS = {
  AUTH_WINDOW_MS: 60_000,
  AUTH_MAX_REQUESTS: 10,
  EXTRACT_WINDOW_MS: 60_000,
  EXTRACT_MAX_REQUESTS: 30,
} as const;

export const PAGINATION_CONSTANTS = {
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
} as const;

export const PARSER_CONSTANTS = {
  CURRENCY_SYMBOLS: {
    "₹": "INR",
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
  } as const,
  DEFAULT_CURRENCY: "INR" as const,
  CONFIDENCE_WEIGHTS: {
    date: 0.25,
    amount: 0.35,
    description: 0.25,
    balance: 0.15,
  } as const,
  MIN_DESCRIPTION_LENGTH: 3,
  MONTH_MAP: {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  } as const,
  CATEGORY_PATTERNS: [
    {
      pattern:
        /coffee|starbucks|cafe|restaurant|food|swiggy|zomato|haldiram|domino|pizza/i,
      category: "Food & Dining",
    },
    {
      pattern:
        /uber|ola|cab|ride|taxi|airport|petrol|diesel|fuel|indian oil|hp petrol/i,
      category: "Transport",
    },
    {
      pattern: /amazon|flipkart|myntra|shopping|order|reliance digital/i,
      category: "Shopping",
    },
    {
      pattern: /netflix|spotify|prime|subscription|pvr|inox|bookmyshow/i,
      category: "Entertainment",
    },
    {
      pattern: /salary|payroll|tcs|income|interest credited/i,
      category: "Income",
    },
    {
      pattern:
        /recharge|broadband|electricity|bill|utility|tata power|airtel|jio|paytm|phonepe/i,
      category: "Utilities",
    },
    {
      pattern: /pharmacy|hospital|clinic|apollo|max hospital|healthcare/i,
      category: "Healthcare",
    },
    { pattern: /atm|withdrawal|cash/i, category: "Cash Withdrawal" },
    { pattern: /dmart|more megastore|grocery/i, category: "Groceries" },
  ] as const,
} as const;

export const ERROR_MESSAGES = {
  NO_ORGANIZATION: "No organization associated with this account",
  INVALID_TEXT_FIELD: "text field is required",
  COULD_NOT_PARSE_AMOUNT:
    "Could not parse a valid transaction amount from the provided text",
  REGISTRATION_FAILED: "Registration failed",
  INVALID_CREDENTIALS: "Invalid email or password",
  NO_TOKEN: "No token in /login response",
} as const;
