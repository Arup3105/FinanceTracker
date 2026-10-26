import * as accountsRoute from "@/app/api/accounts/route";
import * as accountRoute from "@/app/api/accounts/[id]/route";
import * as expenseTypesRoute from "@/app/api/expense-types/route";
import * as expensesRoute from "@/app/api/expenses/route";
import * as incomeRoute from "@/app/api/income/route";
import * as reportsRoute from "@/app/api/reports/route";
import * as transfersRoute from "@/app/api/transfers/route";
import type { AccountDTO, ExpenseTypeDTO, FinancialReport, TransactionDTO } from "@/lib/finance/types";
import { call, key, localNow, type TestUser } from "./helpers";

/** Thin typed wrappers around the real route handlers, used by the integration tests. */

export async function createAccount(user: TestUser, name: string, openingBalance: string, type = "bank") {
  const res = await call<AccountDTO>(accountsRoute.POST, {
    method: "POST",
    user,
    body: { name, type, openingBalance },
  });
  if (res.status !== 201) throw new Error(`createAccount failed: ${res.status} ${res.text}`);
  return res.body.data!;
}

export async function getAccount(user: TestUser, id: string) {
  const res = await call<AccountDTO>(accountRoute.GET, { user, params: { id } });
  if (res.status !== 200) throw new Error(`getAccount failed: ${res.status} ${res.text}`);
  return res.body.data!;
}

export async function firstExpenseType(user: TestUser) {
  const res = await call<ExpenseTypeDTO[]>(expenseTypesRoute.GET, { user });
  return res.body.data![0];
}

export async function addIncome(user: TestUser, accountId: string, amount: string, effectiveAt = localNow()) {
  const res = await call<{ transaction: TransactionDTO }>(incomeRoute.POST, {
    method: "POST",
    user,
    body: { name: "Salary", amount, accountId, effectiveAt, idempotencyKey: key() },
  });
  if (res.status !== 201) throw new Error(`addIncome failed: ${res.status} ${res.text}`);
  return res.body.data!.transaction;
}

export async function addExpense(
  user: TestUser,
  accountId: string,
  amount: string,
  options: { effectiveAt?: string; categoryId?: string; name?: string } = {},
) {
  const categoryId = options.categoryId ?? (await firstExpenseType(user)).id;
  const res = await call<{ transaction: TransactionDTO }>(expensesRoute.POST, {
    method: "POST",
    user,
    body: {
      name: options.name ?? "Groceries",
      amount,
      accountId,
      categoryId,
      effectiveAt: options.effectiveAt ?? localNow(),
      idempotencyKey: key(),
    },
  });
  if (res.status !== 201) throw new Error(`addExpense failed: ${res.status} ${res.text}`);
  return res.body.data!.transaction;
}

export async function transfer(user: TestUser, fromAccountId: string, toAccountId: string, amount: string) {
  const res = await call<{ transaction: TransactionDTO }>(transfersRoute.POST, {
    method: "POST",
    user,
    body: { fromAccountId, toAccountId, amount, effectiveAt: localNow(), idempotencyKey: key() },
  });
  if (res.status !== 201) throw new Error(`transfer failed: ${res.status} ${res.text}`);
  return res.body.data!.transaction;
}

export async function report(user: TestUser, query: Record<string, string> = { period: "month" }) {
  const search = new URLSearchParams(query).toString();
  const res = await call<FinancialReport>(reportsRoute.GET, { user, path: `/api/reports?${search}` });
  if (res.status !== 200) throw new Error(`report failed: ${res.status} ${res.text}`);
  return res.body.data!;
}

export const rupees = (value: number) => Math.round(value * 100);
