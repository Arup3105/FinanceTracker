import "server-only";
import {
  accountsCollection,
  expenseTypesCollection,
  settingsCollection,
  transactionsCollection,
} from "@/server/db/collections";

/** Permanently removes every financial record owned by `userId`. Auth records are untouched. */
export async function deleteAllFinancialData(userId: string): Promise<{ transactions: number; accounts: number }> {
  const [transactions, accounts] = await Promise.all([
    transactionsCollection().deleteMany({ userId }),
    accountsCollection().deleteMany({ userId }),
    expenseTypesCollection().deleteMany({ userId }),
    settingsCollection().deleteOne({ _id: userId }),
  ]);
  return { transactions: transactions.deletedCount, accounts: accounts.deletedCount };
}
