import { expenseTypeSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson } from "@/server/http";
import { createExpenseType, listExpenseTypes } from "@/server/services/expense-type-service";

export const GET = authedRoute(async ({ request, user }) => {
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  return json(await listExpenseTypes(user.id, { includeArchived }));
});

export const POST = authedRoute(async ({ request, user }) => {
  const { name } = parseWith(expenseTypeSchema, await readJson(request));
  return json(await createExpenseType(user.id, name), { status: 201 });
});
