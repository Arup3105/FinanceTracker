import "server-only";
import { cache } from "react";
import { ensureIndexes } from "./db/collections";
import { requirePageUser } from "./session";
import { listAccounts } from "./services/account-service";
import { listExpenseTypes } from "./services/expense-type-service";
import { getSettings } from "./services/settings-service";

/**
 * Per-request context for authenticated pages: the verified user plus the small
 * reference data every form needs. Wrapped in React `cache` so the shell and
 * the page share one set of queries per request.
 */
export const loadAppContext = cache(async () => {
  const user = await requirePageUser();
  await ensureIndexes();
  const [accounts, expenseTypes, settings] = await Promise.all([
    listAccounts(user.id, { includeArchived: true }),
    listExpenseTypes(user.id, { includeArchived: true }),
    getSettings(user.id),
  ]);
  return { user, accounts, expenseTypes, settings };
});

export type AppContextData = Awaited<ReturnType<typeof loadAppContext>>;
