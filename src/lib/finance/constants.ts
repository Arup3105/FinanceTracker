export const ACCOUNT_TYPES = ["bank", "savings", "salary", "cash", "wallet", "credit_card", "other"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: "Bank account",
  savings: "Savings account",
  salary: "Salary account",
  cash: "Cash",
  wallet: "Digital wallet",
  credit_card: "Credit card",
  other: "Other",
};

/**
 * Ledger entry types. Amounts are always stored as positive integer paise; the
 * direction of the balance effect is derived from the type (see ledger.ts).
 */
export const TRANSACTION_TYPES = ["income", "expense", "transfer_out", "transfer_in", "adjustment"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const ADJUSTMENT_DIRECTIONS = ["increase", "decrease"] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expense",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  adjustment: "Balance adjustment",
};

/** How an ATM withdrawal is recorded. See README "Cash withdrawals". */
export const CASH_WITHDRAWAL_MODES = ["expense", "transfer"] as const;
export type CashWithdrawalMode = (typeof CASH_WITHDRAWAL_MODES)[number];

export const DEFAULT_EXPENSE_TYPES = [
  "Food & Groceries",
  "Rent",
  "Utilities",
  "Transport",
  "Shopping",
  "Healthcare",
  "Entertainment",
  "Education",
  "Travel",
  "Subscriptions",
  "Bills",
  "Personal Care",
  "Cash Withdrawal",
  "Other",
] as const;

/** Category used for ATM withdrawals in "expense" cash-withdrawal mode. */
export const CASH_WITHDRAWAL_CATEGORY = "Cash Withdrawal";

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const DEFAULT_CURRENCY = "INR";
export const SUPPORTED_CURRENCIES = ["INR"] as const;

export const PERIODS = ["today", "week", "month", "quarter", "year", "custom"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  year: "This year",
  custom: "Custom range",
};

export const PAGE_SIZE = 20;
