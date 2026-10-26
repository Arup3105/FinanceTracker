import "server-only";
import type { ObjectId } from "mongodb";
import {
  getPeriodRange,
  getPreviousRange,
  listBuckets,
  truncate,
  type BucketUnit,
  type DateRange,
  type PeriodRange,
} from "@/lib/dates";
import { balanceEffectExpression, reportableAmountExpression } from "@/lib/finance/ledger";
import type {
  AccountActivity,
  BreakdownItem,
  FinancialReport,
  PeriodSummary,
  SeriesPoint,
} from "@/lib/finance/types";
import { savingsRate } from "@/lib/money";
import type { PeriodQuery } from "@/lib/validation/schemas";
import { accountsCollection, transactionsCollection } from "@/server/db/collections";
import { getSettings } from "./settings-service";
import { loadLookups, toTransactionDTO } from "./transaction-service";

/**
 * All report figures come from the ledger. Only `income` and `expense` entries
 * count toward income, expenses and savings; transfers, adjustments and opening
 * balances only affect balances.
 */

function rangeMatch(userId: string, range: DateRange) {
  return {
    userId,
    type: { $in: ["income", "expense"] },
    effectiveAt: { $gte: range.start, $lt: range.end },
  };
}

export async function getPeriodSummary(userId: string, range: DateRange): Promise<PeriodSummary> {
  const rows = await transactionsCollection()
    .aggregate<{ _id: "income" | "expense"; total: number; count: number }>([
      { $match: rangeMatch(userId, range) },
      { $group: { _id: "$type", total: { $sum: reportableAmountExpression }, count: { $sum: 1 } } },
    ])
    .toArray();
  const income = rows.find((row) => row._id === "income");
  const expense = rows.find((row) => row._id === "expense");
  const incomePaise = income?.total ?? 0;
  const expensePaise = expense?.total ?? 0;
  const netSavingsPaise = incomePaise - expensePaise;
  return {
    incomePaise,
    expensePaise,
    netSavingsPaise,
    savingsRate: savingsRate(netSavingsPaise, incomePaise),
    incomeCount: income?.count ?? 0,
    expenseCount: expense?.count ?? 0,
  };
}

/** Combined balance of every account (active and archived) at instant `at` (exclusive). */
export async function getCombinedBalanceAt(userId: string, at: Date): Promise<number> {
  const [opening, ledger] = await Promise.all([
    accountsCollection()
      .aggregate<{ total: number }>([
        { $match: { userId } },
        { $group: { _id: null, total: { $sum: "$openingBalancePaise" } } },
      ])
      .toArray(),
    transactionsCollection()
      .aggregate<{ total: number }>([
        { $match: { userId, effectiveAt: { $lt: at } } },
        { $group: { _id: null, total: { $sum: balanceEffectExpression } } },
      ])
      .toArray(),
  ]);
  return (opening[0]?.total ?? 0) + (ledger[0]?.total ?? 0);
}

export async function getSeries(
  userId: string,
  range: DateRange,
  unit: BucketUnit,
  timeZone: string,
  now: Date = new Date(),
): Promise<SeriesPoint[]> {
  const bucketExpr = { $dateTrunc: { date: "$effectiveAt", unit, timezone: timeZone, startOfWeek: "monday" } };
  const [rows, baseline] = await Promise.all([
    transactionsCollection()
      .aggregate<{ _id: { bucket: Date; type: string }; reportable: number; effect: number }>([
        { $match: { userId, effectiveAt: { $gte: range.start, $lt: range.end } } },
        {
          $group: {
            _id: { bucket: bucketExpr, type: "$type" },
            reportable: { $sum: reportableAmountExpression },
            effect: { $sum: balanceEffectExpression },
          },
        },
      ])
      .toArray(),
    getCombinedBalanceAt(userId, range.start),
  ]);

  const byBucket = new Map<number, { income: number; expense: number; effect: number }>();
  for (const row of rows) {
    const key = row._id.bucket.getTime();
    const entry = byBucket.get(key) ?? { income: 0, expense: 0, effect: 0 };
    if (row._id.type === "income") entry.income += row.reportable;
    if (row._id.type === "expense") entry.expense += row.reportable;
    entry.effect += row.effect;
    byBucket.set(key, entry);
  }

  let running = baseline;
  return listBuckets(range, unit, timeZone).map((bucket) => {
    const entry = byBucket.get(bucket.start.getTime()) ?? { income: 0, expense: 0, effect: 0 };
    running += entry.effect;
    return {
      label: bucket.label,
      start: bucket.start.toISOString(),
      incomePaise: entry.income,
      expensePaise: entry.expense,
      netPaise: entry.income - entry.expense,
      balancePaise: bucket.start > now ? null : running,
    };
  });
}

export async function getExpenseByCategory(userId: string, range: DateRange): Promise<BreakdownItem[]> {
  const [rows, lookups] = await Promise.all([
    transactionsCollection()
      .aggregate<{ _id: ObjectId | null; total: number; count: number }>([
        { $match: { ...rangeMatch(userId, range), type: "expense" } },
        { $group: { _id: "$categoryId", total: { $sum: reportableAmountExpression }, count: { $sum: 1 } } },
        { $match: { total: { $gt: 0 } } },
        { $sort: { total: -1 } },
      ])
      .toArray(),
    loadLookups(userId),
  ]);
  return rows.map((row) => {
    const key = row._id?.toHexString() ?? "none";
    return { key, label: lookups.categories.get(key) ?? "Uncategorised", amountPaise: row.total, count: row.count };
  });
}

export async function getIncomeBySource(userId: string, range: DateRange): Promise<BreakdownItem[]> {
  const rows = await transactionsCollection()
    .aggregate<{ _id: string; label: string; total: number; count: number }>([
      { $match: { ...rangeMatch(userId, range), type: "income" } },
      {
        $group: {
          _id: { $toLower: { $trim: { input: "$name" } } },
          label: { $first: "$name" },
          total: { $sum: "$amountPaise" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 20 },
    ])
    .toArray();
  return rows.map((row) => ({ key: row._id, label: row.label, amountPaise: row.total, count: row.count }));
}

export async function getAccountActivity(userId: string, range: DateRange): Promise<AccountActivity[]> {
  const [rows, lookups] = await Promise.all([
    transactionsCollection()
      .aggregate<{ _id: { account: ObjectId; type: string }; total: number }>([
        { $match: { userId, effectiveAt: { $gte: range.start, $lt: range.end }, type: { $ne: "adjustment" } } },
        { $group: { _id: { account: "$accountId", type: "$type" }, total: { $sum: reportableAmountExpression } } },
      ])
      .toArray(),
    loadLookups(userId),
  ]);
  const byAccount = new Map<string, AccountActivity>();
  for (const row of rows) {
    const accountId = row._id.account.toHexString();
    const activity = byAccount.get(accountId) ?? {
      accountId,
      accountName: lookups.accounts.get(accountId) ?? "Unknown account",
      incomePaise: 0,
      expensePaise: 0,
      transferInPaise: 0,
      transferOutPaise: 0,
    };
    if (row._id.type === "income") activity.incomePaise += row.total;
    if (row._id.type === "expense") activity.expensePaise += row.total;
    if (row._id.type === "transfer_in") activity.transferInPaise += row.total;
    if (row._id.type === "transfer_out") activity.transferOutPaise += row.total;
    byAccount.set(accountId, activity);
  }
  return [...byAccount.values()].sort((a, b) => a.accountName.localeCompare(b.accountName));
}

export async function getLargestExpenses(userId: string, range: DateRange, limit = 5) {
  const [docs, lookups] = await Promise.all([
    transactionsCollection()
      .aggregate([
        { $match: { ...rangeMatch(userId, range), type: "expense" } },
        { $addFields: { netPaise: reportableAmountExpression } },
        { $match: { netPaise: { $gt: 0 } } },
        { $sort: { netPaise: -1, effectiveAt: -1 } },
        { $limit: limit },
        { $project: { netPaise: 0 } },
      ])
      .toArray(),
    loadLookups(userId),
  ]);
  return docs.map((doc) => toTransactionDTO(doc as Parameters<typeof toTransactionDTO>[0], lookups));
}

/** Month-by-month income, expenses, net savings and closing balance for the last `months` months. */
export async function getMonthlyTrend(userId: string, months = 12, now = new Date()): Promise<SeriesPoint[]> {
  const { timezone } = await getSettings(userId);
  const end = getPeriodRange("month", timezone, now).end;
  const start = truncate(new Date(getPeriodRange("month", timezone, now).start.getTime() - 1), "month", timezone);
  // Walk back month by month in local time.
  let cursor = start;
  for (let i = 1; i < months - 1; i++) cursor = truncate(new Date(cursor.getTime() - 1), "month", timezone);
  return getSeries(userId, { start: cursor, end }, "month", timezone, now);
}

/** Sum of every account's opening balance (money that existed before tracking began). */
export async function getOpeningBalanceTotal(userId: string): Promise<number> {
  const rows = await accountsCollection()
    .aggregate<{ total: number }>([
      { $match: { userId } },
      { $group: { _id: null, total: { $sum: "$openingBalancePaise" } } },
    ])
    .toArray();
  return rows[0]?.total ?? 0;
}

export function resolvePeriod(query: PeriodQuery, timeZone: string, now = new Date()): PeriodRange {
  return getPeriodRange(query.period, timeZone, now, { from: query.from, to: query.to });
}

/** Everything the dashboard, savings and reports pages need for one period. */
export async function getFinancialReport(userId: string, query: PeriodQuery, now = new Date()): Promise<FinancialReport> {
  const { timezone } = await getSettings(userId);
  const range = resolvePeriod(query, timezone, now);
  const previous = getPreviousRange(range, timezone);
  const [summary, previousSummary, series, expenseByCategory, incomeBySource, accountActivity, largestExpenses] =
    await Promise.all([
      getPeriodSummary(userId, range),
      getPeriodSummary(userId, previous),
      getSeries(userId, range, range.bucket, timezone, now),
      getExpenseByCategory(userId, range),
      getIncomeBySource(userId, range),
      getAccountActivity(userId, range),
      getLargestExpenses(userId, range),
    ]);
  return {
    range: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      label: range.label,
      period: range.period,
      bucket: range.bucket,
    },
    previousRange: { start: previous.start.toISOString(), end: previous.end.toISOString() },
    summary,
    previousSummary,
    series,
    expenseByCategory,
    incomeBySource,
    accountActivity,
    largestExpenses,
  };
}
