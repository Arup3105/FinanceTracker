import { incomeCreateSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson } from "@/server/http";
import { createIncome } from "@/server/services/transaction-service";

export const POST = authedRoute(async ({ request, user }) => {
  const input = parseWith(incomeCreateSchema, await readJson(request));
  const result = await createIncome(user.id, input);
  return json(result, { status: result.duplicate ? 200 : 201 });
});
