import "server-only";
import { csvRow } from "@/lib/csv";
import { formatDateTime, type DateRange } from "@/lib/dates";
import { TRANSACTION_TYPE_LABELS } from "@/lib/finance/constants";
import { balanceEffect, netExpensePaise } from "@/lib/finance/ledger";
import { paiseToRupeeString } from "@/lib/money";
import type { PeriodQuery } from "@/lib/validation/schemas";
import { transactionsCollection } from "@/server/db/collections";
import { getFinancialReport } from "./report-service";
import { getSettings } from "./settings-service";
import { loadLookups } from "./transaction-service";
import { listAccounts } from "./account-service";

const TRANSACTION_HEADER = [
  "Date (local)",
  "Type",
  "Name",
  "Expense type",
  "Account",
  "Other account",
  "Amount (INR)",
  "Refunded (INR)",
  "Net amount (INR)",
  "Balance effect (INR)",
  "Comment",
  "Reference",
  "Adjustment reason",
  "Recorded at (local)",
  "Transaction ID",
];

/**
 * Streams the user's ledger as CSV, oldest first. Only documents matching the
 * authenticated user's id are ever read.
 */
export async function streamTransactionsCsv(userId: string, range?: DateRange): Promise<ReadableStream<Uint8Array>> {
  const [{ timezone }, lookups] = await Promise.all([getSettings(userId), loadLookups(userId)]);
  const filter = range ? { userId, effectiveAt: { $gte: range.start, $lt: range.end } } : { userId };
  const cursor = transactionsCollection().find(filter).sort({ effectiveAt: 1, _id: 1 }).batchSize(500);
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`﻿${csvRow(TRANSACTION_HEADER)}`)); // BOM so Excel reads UTF-8 (₹)
    },
    async pull(controller) {
      try {
        const doc = await cursor.next();
        if (!doc) {
          await cursor.close();
          controller.close();
          return;
        }
        const accountName = lookups.accounts.get(doc.accountId.toHexString()) ?? "";
        const counterparty = doc.counterpartyAccountId
          ? (lookups.accounts.get(doc.counterpartyAccountId.toHexString()) ?? "")
          : "";
        const category = doc.categoryId ? (lookups.categories.get(doc.categoryId.toHexString()) ?? "") : "";
        controller.enqueue(
          encoder.encode(
            csvRow([
              formatDateTime(doc.effectiveAt, timezone),
              TRANSACTION_TYPE_LABELS[doc.type],
              doc.name,
              category,
              accountName,
              counterparty,
              paiseToRupeeString(doc.amountPaise),
              doc.type === "expense" ? paiseToRupeeString(doc.refundedPaise ?? 0) : "",
              doc.type === "expense" ? paiseToRupeeString(netExpensePaise(doc)) : paiseToRupeeString(doc.amountPaise),
              paiseToRupeeString(balanceEffect(doc)),
              doc.comment,
              doc.reference,
              doc.adjustmentReason,
              formatDateTime(doc.createdAt, timezone),
              doc._id.toHexString(),
            ]),
          ),
        );
      } catch (error) {
        await cursor.close();
        controller.error(error);
      }
    },
    async cancel() {
      await cursor.close();
    },
  });
}

/** A period report (summary, breakdowns, account balances) as CSV text. */
export async function buildReportCsv(userId: string, query: PeriodQuery): Promise<string> {
  const [report, accounts] = await Promise.all([getFinancialReport(userId, query), listAccounts(userId, { includeArchived: true })]);
  const { summary, previousSummary } = report;
  let csv = "﻿";
  csv += csvRow(["Financial report", report.range.label]);
  csv += csvRow([]);
  csv += csvRow(["Metric", "This period (INR)", "Previous period (INR)"]);
  csv += csvRow(["Income", paiseToRupeeString(summary.incomePaise), paiseToRupeeString(previousSummary.incomePaise)]);
  csv += csvRow(["Expenses", paiseToRupeeString(summary.expensePaise), paiseToRupeeString(previousSummary.expensePaise)]);
  csv += csvRow([
    "Net savings",
    paiseToRupeeString(summary.netSavingsPaise),
    paiseToRupeeString(previousSummary.netSavingsPaise),
  ]);
  csv += csvRow([
    "Savings rate (%)",
    summary.savingsRate === null ? "n/a" : summary.savingsRate,
    previousSummary.savingsRate === null ? "n/a" : previousSummary.savingsRate,
  ]);
  csv += csvRow([]);
  csv += csvRow(["Expenses by type", "Amount (INR)", "Entries"]);
  for (const item of report.expenseByCategory) csv += csvRow([item.label, paiseToRupeeString(item.amountPaise), item.count]);
  csv += csvRow([]);
  csv += csvRow(["Income by source", "Amount (INR)", "Entries"]);
  for (const item of report.incomeBySource) csv += csvRow([item.label, paiseToRupeeString(item.amountPaise), item.count]);
  csv += csvRow([]);
  csv += csvRow(["Account", "Income", "Expenses", "Transfers in", "Transfers out"]);
  for (const a of report.accountActivity) {
    csv += csvRow([
      a.accountName,
      paiseToRupeeString(a.incomePaise),
      paiseToRupeeString(a.expensePaise),
      paiseToRupeeString(a.transferInPaise),
      paiseToRupeeString(a.transferOutPaise),
    ]);
  }
  csv += csvRow([]);
  csv += csvRow(["Current balances", "Balance (INR)", "Status"]);
  for (const account of accounts) {
    csv += csvRow([account.name, paiseToRupeeString(account.balancePaise), account.isArchived ? "Archived" : "Active"]);
  }
  return csv;
}
