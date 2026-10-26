import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as accountsRoute from "@/app/api/accounts/route";
import * as accountRoute from "@/app/api/accounts/[id]/route";
import * as adjustmentsRoute from "@/app/api/accounts/[id]/adjustments/route";
import * as cashRoute from "@/app/api/cash-withdrawals/route";
import * as dataRoute from "@/app/api/data/route";
import * as expenseTypesRoute from "@/app/api/expense-types/route";
import * as expenseTypeRoute from "@/app/api/expense-types/[id]/route";
import * as expensesRoute from "@/app/api/expenses/route";
import * as expenseRoute from "@/app/api/expenses/[id]/route";
import * as refundsRoute from "@/app/api/expenses/[id]/refunds/route";
import * as exportRoute from "@/app/api/export/route";
import * as incomeRoute from "@/app/api/income/route";
import * as incomeItemRoute from "@/app/api/income/[id]/route";
import * as reportsRoute from "@/app/api/reports/route";
import * as settingsRoute from "@/app/api/settings/route";
import * as transactionsRoute from "@/app/api/transactions/route";
import * as transactionRoute from "@/app/api/transactions/[id]/route";
import * as transfersRoute from "@/app/api/transfers/route";
import * as transferRoute from "@/app/api/transfers/[groupId]/route";
import type { AccountDTO, Paginated, TransactionDTO } from "@/lib/finance/types";
import { proxy } from "@/proxy";
import { accountsCollection, transactionsCollection } from "@/server/db/collections";
import { hasTestDatabase } from "../setup-env";
import { addExpense, addIncome, createAccount, firstExpenseType, getAccount, transfer } from "./api";
import { call, closeDatabase, createUser, key, localNow, resetDatabase, type TestUser } from "./helpers";

describe("Test 15: the proxy redirects signed-out visitors", () => {
  it("redirects protected pages to /login without a session cookie", () => {
    const response = proxy(new NextRequest("http://localhost:3000/dashboard"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fdashboard");
  });
});

describe.skipIf(!hasTestDatabase)("security (integration, MongoDB Atlas test DB)", () => {
  let alice: TestUser;
  let bob: TestUser;
  let bobAccount: AccountDTO;
  let bobExpense: TransactionDTO;
  let bobIncome: TransactionDTO;
  let bobTransfer: TransactionDTO;
  let bobCategoryId: string;
  let aliceAccount: AccountDTO;

  beforeAll(async () => {
    await resetDatabase();
    alice = await createUser("alice");
    bob = await createUser("bob");
    aliceAccount = await createAccount(alice, "Alice Bank", "1000");
    bobAccount = await createAccount(bob, "Bob Secret Bank", "50000");
    const bobSavings = await createAccount(bob, "Bob Savings", "0");
    bobCategoryId = (await firstExpenseType(bob)).id;
    bobExpense = await addExpense(bob, bobAccount.id, "1234.56", { name: "Bob private purchase" });
    bobIncome = await addIncome(bob, bobAccount.id, "9999");
    bobTransfer = await transfer(bob, bobAccount.id, bobSavings.id, "100");
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe("Test 15: every API rejects unauthenticated requests", () => {
    const fakeId = "0123456789abcdef01234567";
    const cases: Array<[string, unknown, string, Record<string, string>?]> = [
      ["GET /api/accounts", accountsRoute.GET, "GET"],
      ["POST /api/accounts", accountsRoute.POST, "POST"],
      ["GET /api/accounts/:id", accountRoute.GET, "GET", { id: fakeId }],
      ["PATCH /api/accounts/:id", accountRoute.PATCH, "PATCH", { id: fakeId }],
      ["DELETE /api/accounts/:id", accountRoute.DELETE, "DELETE", { id: fakeId }],
      ["POST /api/accounts/:id/adjustments", adjustmentsRoute.POST, "POST", { id: fakeId }],
      ["GET /api/transactions", transactionsRoute.GET, "GET"],
      ["GET /api/transactions/:id", transactionRoute.GET, "GET", { id: fakeId }],
      ["DELETE /api/transactions/:id", transactionRoute.DELETE, "DELETE", { id: fakeId }],
      ["POST /api/expenses", expensesRoute.POST, "POST"],
      ["PATCH /api/expenses/:id", expenseRoute.PATCH, "PATCH", { id: fakeId }],
      ["POST /api/expenses/:id/refunds", refundsRoute.POST, "POST", { id: fakeId }],
      ["POST /api/income", incomeRoute.POST, "POST"],
      ["PATCH /api/income/:id", incomeItemRoute.PATCH, "PATCH", { id: fakeId }],
      ["POST /api/transfers", transfersRoute.POST, "POST"],
      ["PATCH /api/transfers/:id", transferRoute.PATCH, "PATCH", { groupId: fakeId }],
      ["POST /api/cash-withdrawals", cashRoute.POST, "POST"],
      ["GET /api/expense-types", expenseTypesRoute.GET, "GET"],
      ["POST /api/expense-types", expenseTypesRoute.POST, "POST"],
      ["GET /api/settings", settingsRoute.GET, "GET"],
      ["PUT /api/settings", settingsRoute.PUT, "PUT"],
      ["GET /api/reports", reportsRoute.GET, "GET"],
      ["GET /api/export", exportRoute.GET, "GET"],
      ["DELETE /api/data", dataRoute.DELETE, "DELETE"],
    ];
    it.each(cases)("%s → 401", async (_name, handler, method, params) => {
      const res = await call(handler, { method, params, body: method === "GET" ? undefined : {} });
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe("UNAUTHORIZED");
    });

    it("rejects a forged session cookie", async () => {
      const res = await call(accountsRoute.GET, {
        user: { id: "x", email: "x", cookie: "better-auth.session_token=forged.value" },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("Test 10: User A cannot read, modify, delete or reference User B's data", () => {
    it("cannot read B's account, transaction or transfer by id", async () => {
      expect((await call(accountRoute.GET, { user: alice, params: { id: bobAccount.id } })).status).toBe(404);
      expect((await call(transactionRoute.GET, { user: alice, params: { id: bobExpense.id } })).status).toBe(404);
      expect(
        (await call(transferRoute.GET, { user: alice, params: { groupId: bobTransfer.transferGroupId! } })).status,
      ).toBe(404);
    });

    it("does not see B's records in lists", async () => {
      const accounts = await call<AccountDTO[]>(accountsRoute.GET, { user: alice });
      expect(accounts.body.data!.map((a) => a.name)).toEqual(["Alice Bank"]);
      const txns = await call<Paginated<TransactionDTO>>(transactionsRoute.GET, { user: alice });
      expect(txns.body.data!.total).toBe(0);
      // Even when filtering explicitly by B's account id.
      const filtered = await call<Paginated<TransactionDTO>>(transactionsRoute.GET, {
        user: alice,
        path: `/api/transactions?accountId=${bobAccount.id}`,
      });
      expect(filtered.body.data!.total).toBe(0);
    });

    it("cannot modify B's account, expense, income or transfer", async () => {
      const patches = await Promise.all([
        call(accountRoute.PATCH, {
          method: "PATCH",
          user: alice,
          params: { id: bobAccount.id },
          body: { name: "Hacked", version: bobAccount.version },
        }),
        call(expenseRoute.PATCH, {
          method: "PATCH",
          user: alice,
          params: { id: bobExpense.id },
          body: {
            name: "Hacked",
            amount: "1",
            accountId: aliceAccount.id,
            categoryId: bobCategoryId,
            effectiveAt: localNow(),
            version: bobExpense.version,
          },
        }),
        call(incomeItemRoute.PATCH, {
          method: "PATCH",
          user: alice,
          params: { id: bobIncome.id },
          body: { name: "Hacked", amount: "1", accountId: aliceAccount.id, effectiveAt: localNow(), version: 0 },
        }),
        call(transferRoute.PATCH, {
          method: "PATCH",
          user: alice,
          params: { groupId: bobTransfer.transferGroupId! },
          body: {
            fromAccountId: aliceAccount.id,
            toAccountId: bobAccount.id,
            amount: "1",
            effectiveAt: localNow(),
            version: 0,
          },
        }),
        call(refundsRoute.POST, {
          method: "POST",
          user: alice,
          params: { id: bobExpense.id },
          body: { amount: "1", refundedAt: localNow(), version: bobExpense.version },
        }),
        call(adjustmentsRoute.POST, {
          method: "POST",
          user: alice,
          params: { id: bobAccount.id },
          body: { targetBalance: "0", reason: "steal", effectiveAt: localNow(), idempotencyKey: key() },
        }),
        call(expenseTypeRoute.PATCH, {
          method: "PATCH",
          user: alice,
          params: { id: bobCategoryId },
          body: { name: "Hacked" },
        }),
      ]);
      for (const res of patches) expect(res.status).toBe(404);
    });

    it("cannot delete B's records", async () => {
      const deletes = await Promise.all([
        call(accountRoute.DELETE, { method: "DELETE", user: alice, params: { id: bobAccount.id } }),
        call(transactionRoute.DELETE, { method: "DELETE", user: alice, params: { id: bobExpense.id } }),
        call(transferRoute.DELETE, {
          method: "DELETE",
          user: alice,
          params: { groupId: bobTransfer.transferGroupId! },
        }),
        call(expenseTypeRoute.DELETE, { method: "DELETE", user: alice, params: { id: bobCategoryId } }),
      ]);
      for (const res of deletes) expect(res.status).toBe(404);
    });

    it("cannot create entries against B's account or expense type", async () => {
      const aliceCategory = (await firstExpenseType(alice)).id;
      const results = await Promise.all([
        call(expensesRoute.POST, {
          method: "POST",
          user: alice,
          body: {
            name: "x",
            amount: "1",
            accountId: bobAccount.id,
            categoryId: aliceCategory,
            effectiveAt: localNow(),
            idempotencyKey: key(),
          },
        }),
        call(expensesRoute.POST, {
          method: "POST",
          user: alice,
          body: {
            name: "x",
            amount: "1",
            accountId: aliceAccount.id,
            categoryId: bobCategoryId,
            effectiveAt: localNow(),
            idempotencyKey: key(),
          },
        }),
        call(incomeRoute.POST, {
          method: "POST",
          user: alice,
          body: { name: "x", amount: "1", accountId: bobAccount.id, effectiveAt: localNow(), idempotencyKey: key() },
        }),
        call(transfersRoute.POST, {
          method: "POST",
          user: alice,
          body: {
            fromAccountId: bobAccount.id,
            toAccountId: aliceAccount.id,
            amount: "1",
            effectiveAt: localNow(),
            idempotencyKey: key(),
          },
        }),
        call(transfersRoute.POST, {
          method: "POST",
          user: alice,
          body: {
            fromAccountId: aliceAccount.id,
            toAccountId: bobAccount.id,
            amount: "1",
            effectiveAt: localNow(),
            idempotencyKey: key(),
          },
        }),
        call(cashRoute.POST, {
          method: "POST",
          user: alice,
          body: { accountId: bobAccount.id, amount: "1", effectiveAt: localNow(), idempotencyKey: key() },
        }),
      ]);
      for (const res of results) expect(res.status).toBe(404);
    });

    it("ignores a userId smuggled in the request body", async () => {
      const res = await call<AccountDTO>(accountsRoute.POST, {
        method: "POST",
        user: alice,
        body: { name: "Smuggled", type: "bank", openingBalance: "1", userId: bob.id },
      });
      expect(res.status).toBe(201);
      const doc = await accountsCollection().findOne({ name: "Smuggled" });
      expect(doc?.userId).toBe(alice.id);
    });

    it("treats malformed ids as not found", async () => {
      for (const id of ["not-an-id", "{$ne:null}", "000000000000000000000000x"]) {
        expect((await call(accountRoute.GET, { user: alice, params: { id } })).status).toBe(404);
      }
    });

    it("leaves B's data completely unchanged", async () => {
      const account = await getAccount(bob, bobAccount.id);
      expect(account.name).toBe("Bob Secret Bank");
      expect(account.balancePaise).toBe(50000_00 - 123456 + 9999_00 - 100_00);
      expect(await transactionsCollection().countDocuments({ userId: bob.id })).toBe(4);
    });

    it("A's data deletion does not touch B's data", async () => {
      const bad = await call(dataRoute.DELETE, { method: "DELETE", user: alice, body: { confirm: "nope" } });
      expect(bad.status).toBe(400);
      const ok = await call(dataRoute.DELETE, { method: "DELETE", user: alice, body: { confirm: "DELETE" } });
      expect(ok.status).toBe(200);
      expect(await accountsCollection().countDocuments({ userId: alice.id })).toBe(0);
      expect(await accountsCollection().countDocuments({ userId: bob.id })).toBe(2);
    });
  });

  it("rejects cross-site mutating requests", async () => {
    const res = await call(accountsRoute.POST, {
      method: "POST",
      user: bob,
      headers: { origin: "https://evil.example" },
      body: { name: "x", type: "bank", openingBalance: "0" },
    });
    expect(res.status).toBe(403);
  });

  it("Test 16: CSV exports contain only the authenticated user's data", async () => {
    const carol = await createUser("carol");
    const carolAccount = await createAccount(carol, "Carol Wallet", "0", "cash");
    await addExpense(carol, carolAccount.id, "42", { name: "Carol coffee" });

    const carolCsv = await call(exportRoute.GET, { user: carol, path: "/api/export?type=transactions" });
    expect(carolCsv.status).toBe(200);
    expect(carolCsv.headers.get("content-type")).toContain("text/csv");
    expect(carolCsv.text).toContain("Carol coffee");
    expect(carolCsv.text).not.toContain("Bob private purchase");
    expect(carolCsv.text).not.toContain("Bob Secret Bank");
    expect(carolCsv.text.trim().split("\r\n")).toHaveLength(2); // header + 1 row

    const report = await call(exportRoute.GET, { user: carol, path: "/api/export?type=report&period=month" });
    expect(report.status).toBe(200);
    expect(report.text).toContain("Carol Wallet");
    expect(report.text).not.toContain("Bob");

    const bobCsv = await call(exportRoute.GET, { user: bob, path: "/api/export?type=transactions" });
    expect(bobCsv.text).toContain("Bob private purchase");
    expect(bobCsv.text).not.toContain("Carol");
  });
});
