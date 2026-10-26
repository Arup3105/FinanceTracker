import { deleteDataSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson } from "@/server/http";
import { deleteAllFinancialData } from "@/server/services/data-service";

/** Permanently deletes all of the user's financial data (accounts, transactions, expense types, settings). */
export const DELETE = authedRoute(async ({ request, user }) => {
  parseWith(deleteDataSchema, await readJson(request));
  return json(await deleteAllFinancialData(user.id));
});
