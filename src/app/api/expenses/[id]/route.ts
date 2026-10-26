import { expenseUpdateSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson, toObjectId } from "@/server/http";
import { updateExpense } from "@/server/services/transaction-service";

export const PATCH = authedRoute<{ id: string }>(async ({ request, user, params }) => {
  const id = toObjectId(params.id, "Expense");
  const input = parseWith(expenseUpdateSchema, await readJson(request));
  return json(await updateExpense(user.id, id, input));
});
