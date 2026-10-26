import { expenseTypeUpdateSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson, toObjectId } from "@/server/http";
import { deleteExpenseType, updateExpenseType } from "@/server/services/expense-type-service";

type Params = { id: string };

export const PATCH = authedRoute<Params>(async ({ request, user, params }) => {
  const id = toObjectId(params.id, "Expense type");
  const input = parseWith(expenseTypeUpdateSchema, await readJson(request));
  return json(await updateExpenseType(user.id, id, input));
});

export const DELETE = authedRoute<Params>(async ({ user, params }) => {
  await deleteExpenseType(user.id, toObjectId(params.id, "Expense type"));
  return json({ deleted: true });
});
