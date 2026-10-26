import type {
  AccountType,
  AdjustmentDirection,
  CashWithdrawalMode,
  TransactionType,
} from "./constants";

/** Serializable shapes passed from the server to client components. Dates are ISO strings. */

export interface AccountDTO {
  id: string;
  name: string;
  type: AccountType;
  openingBalancePaise: number;
  balancePaise: number;
  currency: "INR";
  isArchived: boolean;
  hasTransactions: boolean;
  version: number;
  createdAt: string;
}

export interface RefundDTO {
  id: string;
  amountPaise: number;
  refundedAt: string;
  note?: string;
}

export interface TransactionDTO {
  id: string;
  type: TransactionType;
  name: string;
  amountPaise: number;
  /** Amount counted in reports (expense minus refunds); equals amountPaise otherwise. */
  netAmountPaise: number;
  refundedPaise: number;
  refunds: RefundDTO[];
  accountId: string;
  accountName: string;
  categoryId?: string;
  categoryName?: string;
  effectiveAt: string;
  createdAt: string;
  updatedAt: string;
  comment?: string;
  reference?: string;
  transferGroupId?: string;
  counterpartyAccountId?: string;
  counterpartyAccountName?: string;
  isCashWithdrawal: boolean;
  adjustmentDirection?: AdjustmentDirection;
  adjustmentReason?: string;
  version: number;
}

export interface ExpenseTypeDTO {
  id: string;
  name: string;
  isDefault: boolean;
  isArchived: boolean;
}

export interface SettingsDTO {
  currency: "INR";
  timezone: string;
  cashWithdrawalMode: CashWithdrawalMode;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PeriodSummary {
  incomePaise: number;
  expensePaise: number;
  netSavingsPaise: number;
  savingsRate: number | null;
  incomeCount: number;
  expenseCount: number;
}

export interface SeriesPoint {
  label: string;
  start: string;
  incomePaise: number;
  expensePaise: number;
  netPaise: number;
  /** Combined balance at the end of the bucket; null for buckets in the future. */
  balancePaise: number | null;
}

export interface BreakdownItem {
  key: string;
  label: string;
  amountPaise: number;
  count: number;
}

export interface AccountActivity {
  accountId: string;
  accountName: string;
  incomePaise: number;
  expensePaise: number;
  transferInPaise: number;
  transferOutPaise: number;
}

export interface FinancialReport {
  range: { start: string; end: string; label: string; period: string; bucket: string };
  previousRange: { start: string; end: string };
  summary: PeriodSummary;
  previousSummary: PeriodSummary;
  series: SeriesPoint[];
  expenseByCategory: BreakdownItem[];
  incomeBySource: BreakdownItem[];
  accountActivity: AccountActivity[];
  largestExpenses: TransactionDTO[];
}
