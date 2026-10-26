import type { AdjustmentDirection, TransactionType } from "./constants";

/**
 * LEDGER CONVENTION
 * -----------------
 * Every ledger entry stores a positive integer `amountPaise`. Its effect on the
 * owning account's balance is derived from the entry type:
 *
 *   income        +amount
 *   expense       −(amount − refunded)        refunds reduce the original expense
 *   transfer_in   +amount                     paired with a transfer_out of the same amount
 *   transfer_out  −amount
 *   adjustment    ±amount                     sign from `adjustmentDirection`
 *
 *   balance(account) = openingBalance + Σ effect(entry)
 *
 * Reporting:
 *   period income   = Σ income.amount               (effectiveAt within period)
 *   period expenses = Σ (expense.amount − refunded) (effectiveAt within period)
 *   net savings     = income − expenses
 * Transfers, adjustments and opening balances never count as income or expense.
 */

export interface LedgerEntryLike {
  type: TransactionType;
  amountPaise: number;
  refundedPaise?: number;
  adjustmentDirection?: AdjustmentDirection;
}

export function netExpensePaise(entry: Pick<LedgerEntryLike, "amountPaise" | "refundedPaise">): number {
  return entry.amountPaise - (entry.refundedPaise ?? 0);
}

/** Signed effect of a single ledger entry on its account balance, in paise. */
export function balanceEffect(entry: LedgerEntryLike): number {
  switch (entry.type) {
    case "income":
    case "transfer_in":
      return entry.amountPaise;
    case "expense":
      return -netExpensePaise(entry);
    case "transfer_out":
      return -entry.amountPaise;
    case "adjustment":
      return entry.adjustmentDirection === "decrease" ? -entry.amountPaise : entry.amountPaise;
  }
}

export function accountBalance(openingBalancePaise: number, entries: readonly LedgerEntryLike[]): number {
  return entries.reduce((total, entry) => total + balanceEffect(entry), openingBalancePaise);
}

export interface PeriodTotals {
  incomePaise: number;
  expensePaise: number;
  netSavingsPaise: number;
}

/** Income / expense / net savings for a set of entries already filtered to a period. */
export function periodTotals(entries: readonly LedgerEntryLike[]): PeriodTotals {
  let incomePaise = 0;
  let expensePaise = 0;
  for (const entry of entries) {
    if (entry.type === "income") incomePaise += entry.amountPaise;
    else if (entry.type === "expense") expensePaise += netExpensePaise(entry);
  }
  return { incomePaise, expensePaise, netSavingsPaise: incomePaise - expensePaise };
}

/** MongoDB aggregation expression equivalent of `balanceEffect` (keep both in sync). */
export const balanceEffectExpression = {
  $switch: {
    branches: [
      { case: { $in: ["$type", ["income", "transfer_in"]] }, then: "$amountPaise" },
      {
        case: { $eq: ["$type", "expense"] },
        then: { $multiply: [-1, { $subtract: ["$amountPaise", { $ifNull: ["$refundedPaise", 0] }] }] },
      },
      { case: { $eq: ["$type", "transfer_out"] }, then: { $multiply: [-1, "$amountPaise"] } },
      {
        case: { $eq: ["$type", "adjustment"] },
        then: {
          $cond: [{ $eq: ["$adjustmentDirection", "decrease"] }, { $multiply: [-1, "$amountPaise"] }, "$amountPaise"],
        },
      },
    ],
    default: 0,
  },
} as const;

/** MongoDB expression for the reportable amount of an income/expense entry. */
export const reportableAmountExpression = {
  $cond: [
    { $eq: ["$type", "expense"] },
    { $subtract: ["$amountPaise", { $ifNull: ["$refundedPaise", 0] }] },
    "$amountPaise",
  ],
} as const;
