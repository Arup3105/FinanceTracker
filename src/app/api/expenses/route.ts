import { expenseCreateSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson } from "@/server/http";
import { createExpense } from "@/server/services/transaction-service";

export const POST = authedRoute(async ({ request, user }) => {
  const input = parseWith(expenseCreateSchema, await readJson(request));
  const result = await createExpense(user.id, input);
  return json(result, { status: result.duplicate ? 200 : 201 });
});
