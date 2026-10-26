import { subMonths } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as accountRoute from "@/app/api/accounts/[id]/route";
import * as adjustmentsRoute from "@/app/api/accounts/[id]/adjustments/route";
import * as cashRoute from "@/app/api/cash-withdrawals/route";
import * as expenseRoute from "@/app/api/expenses/[id]/route";
import * as expensesRoute from "@/app/api/expenses/route";
import * as refundsRoute from "@/app/api/expenses/[id]/refunds/route";
import * as refundRoute from "@/app/api/expenses/[id]/refunds/[refundId]/route";
import * as settingsRoute from "@/app/api/settings/route";
import * as transactionRoute from "@/app/api/transactions/[id]/route";
import * as transactionsRoute from "@/app/api/transactions/route";
import * as transferRoute from "@/app/api/transfers/[groupId]/route";
import { getPeriodRange, toLocalDateInput } from "@/lib/dates";
import type { AccountDTO, Paginated, TransactionDTO } from "@/lib/finance/types";
import { transactionsCollection } from "@/server/db/collections";
import { hasTestDatabase } from "../setup-env";
import {
  addExpense,
  addIncome,
  createAccount,
  firstExpenseType,
  getAccount,
  report,
  rupees,
  transfer,
} from "./api";
import { IST, call, closeDatabase, createUser, key, localNow, resetDatabase, type TestUser } from "./helpers";

describe.skipIf(!hasTestDatabase)("financial behaviour (integration, MongoDB Atlas test DB)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe("core ledger", () => {
    let user: TestUser;
    let account: AccountDTO;

    beforeAll(async () => {
      user = await createUser("ledger");
    });

    it("Test 1: opening balance counts toward balance but not income or savings", async () => {
      account = await createAccount(user, "Salary Account", "10000");
      expect(account.balancePaise).toBe(rupees(10000));
      const { summary } = await report(user);
      expect(summary.incomePaise).toBe(0);
      expect(summary.expensePaise).toBe(0);
      expect(summary.netSavingsPaise).toBe(0);
      expect(summary.savingsRate).toBeNull();
    });

    it("Test 2: income increases the balance and period income", async () => {
      await addIncome(user, account.id, "25000");
      expect((await getAccount(user, account.id)).balancePaise).toBe(rupees(35000));
      expect((await report(user)).summary.incomePaise).toBe(rupees(25000));
    });

    it("Test 3 & 4: expenses decrease the balance; net savings = income − expenses", async () => {
      await addExpense(user, account.id, "5000");
      expect((await getAccount(user, account.id)).balancePaise).toBe(rupees(30000));
      const { summary } = await report(user);
      expect(summary.expensePaise).toBe(rupees(5000));
      expect(summary.netSavingsPaise).toBe(rupees(20000));
      expect(summary.savingsRate).toBe(80);
    });

    it("Test 11: paise arithmetic is exact through the API", async () => {
      const wallet = await createAccount(user, "Precision Wallet", "0", "cash");
      await addIncome(user, wallet.id, "100.10");
      await addIncome(user, wallet.id, "200.20");
      await addIncome(user, wallet.id, "50.05");
      expect((await getAccount(user, wallet.id)).balancePaise).toBe(35035);
    });
  });

  it("Test 5: an internal transfer moves money without touching income, expenses or savings", async () => {
    const user = await createUser("transfer");
    const a = await createAccount(user, "Account A", "20000");
    const b = await createAccount(user, "Account B", "5000");
    const before = await report(user);

    const t = await transfer(user, a.id, b.id, "3000");
    expect(t.type).toBe("transfer_out");

    const [afterA, afterB] = await Promise.all([getAccount(user, a.id), getAccount(user, b.id)]);
    expect(afterA.balancePaise).toBe(rupees(17000));
    expect(afterB.balancePaise).toBe(rupees(8000));
    expect(afterA.balancePaise + afterB.balancePaise).toBe(rupees(25000));

    const after = await report(user);
    expect(after.summary).toEqual(before.summary);

    // Both legs exist and share one group id.
    const legs = await transactionsCollection().find({ userId: user.id, transferGroupId: { $exists: true } }).toArray();
    expect(legs.map((l) => l.type).sort()).toEqual(["transfer_in", "transfer_out"]);

    // Same-account transfers are rejected.
    const res = await call(
      (await import("@/app/api/transfers/route")).POST,
      {
        method: "POST",
        user,
        body: { fromAccountId: a.id, toAccountId: a.id, amount: "1", effectiveAt: localNow(), idempotencyKey: key() },
      },
    );
    expect(res.status).toBe(400);
  });

  it("Test 6: a ₹300 refund on a ₹1,000 expense nets to ₹700, counted once", async () => {
    const user = await createUser("refund");
    const account = await createAccount(user, "Card", "0", "credit_card");
    const expense = await addExpense(user, account.id, "1000");

    const refunded = await call<TransactionDTO>(refundsRoute.POST, {
      method: "POST",
      user,
      params: { id: expense.id },
      body: { amount: "300", refundedAt: localNow(), version: expense.version },
    });
    expect(refunded.status).toBe(201);
    expect(refunded.body.data!.netAmountPaise).toBe(rupees(700));

    const { summary } = await report(user);
    expect(summary.expensePaise).toBe(rupees(700));
    expect(summary.incomePaise).toBe(0); // refund is not income
    expect((await getAccount(user, account.id)).balancePaise).toBe(-rupees(700));

    // Over-refunding is rejected.
    const tooMuch = await call(refundsRoute.POST, {
      method: "POST",
      user,
      params: { id: expense.id },
      body: { amount: "800", refundedAt: localNow(), version: refunded.body.data!.version },
    });
    expect(tooMuch.status).toBe(400);

    // Deleting the refund restores the full expense.
    const refundId = refunded.body.data!.refunds[0].id;
    const removed = await call<TransactionDTO>(refundRoute.DELETE, {
      method: "DELETE",
      user,
      params: { id: expense.id, refundId },
      body: { version: refunded.body.data!.version },
    });
    expect(removed.status).toBe(200);
    expect((await report(user)).summary.expensePaise).toBe(rupees(1000));
    expect((await getAccount(user, account.id)).balancePaise).toBe(-rupees(1000));
  });

  it("Test 7: a back-dated expense lands in the previous month and keeps its real creation time", async () => {
    const user = await createUser("historical");
    const account = await createAccount(user, "Bank", "5000");
    const lastMonth = getPeriodRange("month", IST, subMonths(new Date(), 1));
    const effectiveAt = `${toLocalDateInput(lastMonth.start, IST).slice(0, 8)}15T12:00`;
    const startedAt = Date.now();
    const expense = await addExpense(user, account.id, "450", { effectiveAt });

    expect(new Date(expense.createdAt).getTime()).toBeGreaterThanOrEqual(startedAt - 1000);
    expect(new Date(expense.effectiveAt).getTime()).toBeLessThan(lastMonth.end.getTime());

    const previous = await report(user, {
      period: "custom",
      from: toLocalDateInput(lastMonth.start, IST),
      to: toLocalDateInput(new Date(lastMonth.end.getTime() - 1), IST),
    });
    expect(previous.summary.expensePaise).toBe(rupees(450));
    expect((await report(user)).summary.expensePaise).toBe(0);
    // Balance reflects the historical expense.
    expect((await getAccount(user, account.id)).balancePaise).toBe(rupees(4550));
  });

  it("rejects future-dated transactions", async () => {
    const user = await createUser("future");
    const account = await createAccount(user, "Bank", "0");
    const category = await firstExpenseType(user);
    const res = await call(expensesRoute.POST, {
      method: "POST",
      user,
      body: {
        name: "Later",
        amount: "10",
        accountId: account.id,
        categoryId: category.id,
        effectiveAt: "2099-01-01T10:00",
        idempotencyKey: key(),
      },
    });
    expect(res.status).toBe(400);
  });

  it("Test 8: editing an expense from ₹500 to ₹700 updates totals without duplicating it", async () => {
    const user = await createUser("edit");
    const account = await createAccount(user, "Bank", "10000");
    const expense = await addExpense(user, account.id, "500");

    const res = await call<TransactionDTO>(expenseRoute.PATCH, {
      method: "PATCH",
      user,
      params: { id: expense.id },
      body: {
        name: expense.name,
        amount: "700",
        accountId: account.id,
        categoryId: expense.categoryId,
        effectiveAt: localNow(2),
        version: expense.version,
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.data!.amountPaise).toBe(rupees(700));
    expect(res.body.data!.createdAt).toBe(expense.createdAt);

    expect((await getAccount(user, account.id)).balancePaise).toBe(rupees(9300));
    expect((await report(user)).summary.expensePaise).toBe(rupees(700));
    expect(await transactionsCollection().countDocuments({ userId: user.id })).toBe(1);

    // A stale version (concurrent edit) is rejected.
    const stale = await call(expenseRoute.PATCH, {
      method: "PATCH",
      user,
      params: { id: expense.id },
      body: {
        name: "x",
        amount: "1",
        accountId: account.id,
        categoryId: expense.categoryId,
        effectiveAt: localNow(),
        version: expense.version,
      },
    });
    expect(stale.status).toBe(409);
  });

  it("Test 9: deleting entries recalculates balances; deleting a transfer leg removes both legs", async () => {
    const user = await createUser("delete");
    const a = await createAccount(user, "A", "1000");
    const b = await createAccount(user, "B", "0");
    const expense = await addExpense(user, a.id, "200");
    const t = await transfer(user, a.id, b.id, "300");

    const del = await call(transactionRoute.DELETE, { method: "DELETE", user, params: { id: expense.id } });
    expect(del.status).toBe(200);
    expect((await getAccount(user, a.id)).balancePaise).toBe(rupees(700));
    expect((await report(user)).summary.expensePaise).toBe(0);

    // Delete via the incoming leg: both legs must disappear.
    const incoming = await transactionsCollection().findOne({ userId: user.id, type: "transfer_in" });
    const delTransfer = await call(transactionRoute.DELETE, {
      method: "DELETE",
      user,
      params: { id: incoming!._id.toHexString() },
    });
    expect(delTransfer.status).toBe(200);
    expect(await transactionsCollection().countDocuments({ userId: user.id, transferGroupId: { $exists: true } })).toBe(0);
    expect((await getAccount(user, a.id)).balancePaise).toBe(rupees(1000));
    expect((await getAccount(user, b.id)).balancePaise).toBe(0);
    expect(t.transferGroupId).toBeDefined();
  });

  it("editing a transfer updates both legs atomically", async () => {
    const user = await createUser("transfer-edit");
    const a = await createAccount(user, "A", "1000");
    const b = await createAccount(user, "B", "0");
    const t = await transfer(user, a.id, b.id, "300");
    const res = await call<TransactionDTO>(transferRoute.PATCH, {
      method: "PATCH",
      user,
      params: { groupId: t.transferGroupId! },
      body: { fromAccountId: a.id, toAccountId: b.id, amount: "450", effectiveAt: localNow(), version: t.version },
    });
    expect(res.status).toBe(200);
    expect((await getAccount(user, a.id)).balancePaise).toBe(rupees(550));
    expect((await getAccount(user, b.id)).balancePaise).toBe(rupees(450));
  });

  it("duplicate submissions with the same idempotency key create one entry", async () => {
    const user = await createUser("idempotent");
    const account = await createAccount(user, "Bank", "0");
    const category = await firstExpenseType(user);
    const body = {
      name: "Lunch",
      amount: "120",
      accountId: account.id,
      categoryId: category.id,
      effectiveAt: localNow(),
      idempotencyKey: key(),
    };
    const [first, second] = await Promise.all([
      call<{ transaction: TransactionDTO; duplicate: boolean }>(expensesRoute.POST, { method: "POST", user, body }),
      call<{ transaction: TransactionDTO; duplicate: boolean }>(expensesRoute.POST, { method: "POST", user, body }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body.data!.transaction.id).toBe(second.body.data!.transaction.id);
    expect(await transactionsCollection().countDocuments({ userId: user.id })).toBe(1);
  });

  describe("Test 12: ATM withdrawals are never double counted", () => {
    it("expense mode (default): the withdrawal is the expense", async () => {
      const user = await createUser("atm-expense");
      const bank = await createAccount(user, "Bank", "10000");
      const res = await call<{ transaction: TransactionDTO }>(cashRoute.POST, {
        method: "POST",
        user,
        body: { accountId: bank.id, amount: "2000", effectiveAt: localNow(), idempotencyKey: key() },
      });
      expect(res.status).toBe(201);
      expect(res.body.data!.transaction.type).toBe("expense");
      expect(res.body.data!.transaction.categoryName).toBe("Cash Withdrawal");
      expect((await report(user)).summary.expensePaise).toBe(rupees(2000));
      expect((await getAccount(user, bank.id)).balancePaise).toBe(rupees(8000));
    });

    it("transfer mode: withdrawal moves money to cash; only cash purchases are expenses", async () => {
      const user = await createUser("atm-transfer");
      await call(settingsRoute.PUT, {
        method: "PUT",
        user,
        body: { currency: "INR", timezone: IST, cashWithdrawalMode: "transfer" },
      });
      const bank = await createAccount(user, "Bank", "10000");
      const cash = await createAccount(user, "Cash", "0", "cash");
      const res = await call<{ transaction: TransactionDTO }>(cashRoute.POST, {
        method: "POST",
        user,
        body: { accountId: bank.id, cashAccountId: cash.id, amount: "2000", effectiveAt: localNow(), idempotencyKey: key() },
      });
      expect(res.status).toBe(201);
      expect(res.body.data!.transaction.type).toBe("transfer_out");
      expect((await report(user)).summary.expensePaise).toBe(0);

      await addExpense(user, cash.id, "500", { name: "Street food" });
      expect((await report(user)).summary.expensePaise).toBe(rupees(500));
      const [b, c] = await Promise.all([getAccount(user, bank.id), getAccount(user, cash.id)]);
      expect(b.balancePaise + c.balancePaise).toBe(rupees(9500));
    });
  });

  it("Test 13: opening balance is editable until the first entry, then corrections are audited adjustments", async () => {
    const user = await createUser("opening");
    const account = await createAccount(user, "Bank", "1000");

    const edit = await call<AccountDTO>(accountRoute.PATCH, {
      method: "PATCH",
      user,
      params: { id: account.id },
      body: { openingBalance: "1500", version: account.version },
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data!.balancePaise).toBe(rupees(1500));

    await addIncome(user, account.id, "500");
    const locked = await call(accountRoute.PATCH, {
      method: "PATCH",
      user,
      params: { id: account.id },
      body: { openingBalance: "9999", version: edit.body.data!.version },
    });
    expect(locked.status).toBe(409);

    const adjust = await call<{ adjustmentId: string; account: AccountDTO }>(adjustmentsRoute.POST, {
      method: "POST",
      user,
      params: { id: account.id },
      body: { targetBalance: "1800", reason: "Bank charges not recorded", effectiveAt: localNow(), idempotencyKey: key() },
    });
    expect(adjust.status).toBe(201);
    expect(adjust.body.data!.account.balancePaise).toBe(rupees(1800));
    expect(adjust.body.data!.account.openingBalancePaise).toBe(rupees(1500)); // history untouched

    const adjustment = await transactionsCollection().findOne({ userId: user.id, type: "adjustment" });
    expect(adjustment).toMatchObject({ amountPaise: rupees(200), adjustmentDirection: "decrease", adjustmentReason: "Bank charges not recorded" });

    const { summary } = await report(user);
    expect(summary.incomePaise).toBe(rupees(500));
    expect(summary.expensePaise).toBe(0);

    // Adjustments are an audit trail and cannot be deleted.
    const del = await call(transactionRoute.DELETE, {
      method: "DELETE",
      user,
      params: { id: adjustment!._id.toHexString() },
    });
    expect(del.status).toBe(409);

    // Accounts with history are archived, not deleted.
    const delAccount = await call(accountRoute.DELETE, { method: "DELETE", user, params: { id: account.id } });
    expect(delAccount.status).toBe(409);
  });

  it("Test 14: reports group around midnight, month-end, quarter-end and year-end in IST", async () => {
    const user = await createUser("boundaries");
    const account = await createAccount(user, "Bank", "0");
    await addExpense(user, account.id, "1", { effectiveAt: "2025-03-31T23:59" }); // Q1, March
    await addExpense(user, account.id, "2", { effectiveAt: "2025-04-01T00:00" }); // Q2, April
    await addExpense(user, account.id, "4", { effectiveAt: "2025-12-31T23:59" }); // 2025
    await addExpense(user, account.id, "8", { effectiveAt: "2026-01-01T00:00" }); // 2026

    const march = await report(user, { period: "custom", from: "2025-03-01", to: "2025-03-31" });
    expect(march.summary.expensePaise).toBe(rupees(1));
    const q2day1 = await report(user, { period: "custom", from: "2025-04-01", to: "2025-04-01" });
    expect(q2day1.summary.expensePaise).toBe(rupees(2));
    const year2025 = await report(user, { period: "custom", from: "2025-01-01", to: "2025-12-31" });
    expect(year2025.summary.expensePaise).toBe(rupees(7));

    // Monthly buckets come from MongoDB $dateTrunc with timezone Asia/Kolkata.
    const byMonth = Object.fromEntries(year2025.series.map((p) => [p.label, p.expensePaise]));
    expect(byMonth["Mar 2025"]).toBe(rupees(1));
    expect(byMonth["Apr 2025"]).toBe(rupees(2));
    expect(byMonth["Dec 2025"]).toBe(rupees(4));

    const jan1 = await report(user, { period: "custom", from: "2026-01-01", to: "2026-01-01" });
    expect(jan1.summary.expensePaise).toBe(rupees(8));
    const hourly = Object.fromEntries(jan1.series.map((p) => [p.label, p.expensePaise]));
    expect(hourly["12 AM"]).toBe(rupees(8));
  });

  it("lists, searches, filters and paginates transactions server-side", async () => {
    const user = await createUser("list");
    const account = await createAccount(user, "Bank", "100000");
    for (let i = 0; i < 23; i++) await addExpense(user, account.id, String(i + 1), { name: i % 2 ? "Coffee" : "Rent" });
    const page1 = await call<Paginated<TransactionDTO>>(transactionsRoute.GET, {
      user,
      path: "/api/transactions?kind=expense&sort=amount_desc",
    });
    expect(page1.body.data!.items).toHaveLength(20);
    expect(page1.body.data!.total).toBe(23);
    expect(page1.body.data!.items[0].amountPaise).toBe(rupees(23));
    const search = await call<Paginated<TransactionDTO>>(transactionsRoute.GET, {
      user,
      path: "/api/transactions?kind=expense&q=coff",
    });
    expect(search.body.data!.total).toBe(11);
  });
});
