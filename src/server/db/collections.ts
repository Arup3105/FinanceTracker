import "server-only";
import type { Collection, ObjectId } from "mongodb";
import type {
  AccountType,
  AdjustmentDirection,
  CashWithdrawalMode,
  TransactionType,
} from "@/lib/finance/constants";
import { getDb } from "./client";

/**
 * Collections owned by the finance app. Better Auth manages its own
 * collections (`user`, `session`, `account`, `verification`, `rateLimit`).
 * `userId` is always the Better Auth user id string taken from the verified session.
 */

export interface FinancialAccountDoc {
  _id: ObjectId;
  userId: string;
  name: string;
  /** Lower-cased, trimmed name used for per-user uniqueness. */
  nameKey: string;
  type: AccountType;
  openingBalancePaise: number;
  currency: "INR";
  isArchived: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefundRecord {
  _id: ObjectId;
  amountPaise: number;
  refundedAt: Date;
  note?: string;
  createdAt: Date;
}

export interface TransactionDoc {
  _id: ObjectId;
  userId: string;
  accountId: ObjectId;
  type: TransactionType;
  /** Always a positive integer; direction is derived from `type`. */
  amountPaise: number;
  name: string;
  /** Expense type (category). Expenses only. */
  categoryId?: ObjectId;
  /** When the money actually moved (user-editable, may be historical). */
  effectiveAt: Date;
  /** When the record was created (never changes). */
  createdAt: Date;
  updatedAt: Date;
  comment?: string;
  reference?: string;
  /** Expenses only: total refunded so far, always ≤ amountPaise. */
  refundedPaise?: number;
  refunds?: RefundRecord[];
  /** Transfers only: both legs share this id. */
  transferGroupId?: ObjectId;
  counterpartyAccountId?: ObjectId;
  /** True when this expense or transfer was recorded via the ATM withdrawal action. */
  isCashWithdrawal?: boolean;
  /** Adjustments only. */
  adjustmentDirection?: AdjustmentDirection;
  adjustmentReason?: string;
  /** Client-generated key that makes create requests safe to retry. */
  idempotencyKey?: string;
  /** Optimistic concurrency counter. */
  version: number;
}

export interface ExpenseTypeDoc {
  _id: ObjectId;
  userId: string;
  name: string;
  nameKey: string;
  isDefault: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSettingsDoc {
  _id: string; // userId
  currency: "INR";
  timezone: string;
  cashWithdrawalMode: CashWithdrawalMode;
  createdAt: Date;
  updatedAt: Date;
}

export const COLLECTIONS = {
  accounts: "financialAccounts",
  transactions: "transactions",
  expenseTypes: "expenseTypes",
  settings: "userSettings",
} as const;

export function accountsCollection(): Collection<FinancialAccountDoc> {
  return getDb().collection<FinancialAccountDoc>(COLLECTIONS.accounts);
}

export function transactionsCollection(): Collection<TransactionDoc> {
  return getDb().collection<TransactionDoc>(COLLECTIONS.transactions);
}

export function expenseTypesCollection(): Collection<ExpenseTypeDoc> {
  return getDb().collection<ExpenseTypeDoc>(COLLECTIONS.expenseTypes);
}

export function settingsCollection(): Collection<UserSettingsDoc> {
  return getDb().collection<UserSettingsDoc>(COLLECTIONS.settings);
}

let indexesReady: Promise<void> | undefined;

/**
 * Creates indexes once per server process. `createIndexes` is idempotent, so
 * concurrent cold starts are harmless.
 */
export function ensureIndexes(): Promise<void> {
  indexesReady ??= createIndexes().catch((error) => {
    indexesReady = undefined;
    throw error;
  });
  return indexesReady;
}

async function createIndexes() {
  await Promise.all([
    accountsCollection().createIndexes([
      { key: { userId: 1, nameKey: 1 }, name: "user_name_unique", unique: true },
      { key: { userId: 1, isArchived: 1, createdAt: 1 }, name: "user_archived" },
    ]),
    transactionsCollection().createIndexes([
      { key: { userId: 1, effectiveAt: -1 }, name: "user_effective" },
      { key: { userId: 1, type: 1, effectiveAt: -1 }, name: "user_type_effective" },
      { key: { userId: 1, accountId: 1, effectiveAt: -1 }, name: "user_account_effective" },
      { key: { userId: 1, categoryId: 1, effectiveAt: -1 }, name: "user_category_effective", sparse: true },
      { key: { userId: 1, transferGroupId: 1 }, name: "user_transfer_group", sparse: true },
      {
        key: { userId: 1, idempotencyKey: 1 },
        name: "user_idempotency_unique",
        unique: true,
        partialFilterExpression: { idempotencyKey: { $type: "string" } },
      },
    ]),
    expenseTypesCollection().createIndexes([
      { key: { userId: 1, nameKey: 1 }, name: "user_name_unique", unique: true },
    ]),
  ]);
}
