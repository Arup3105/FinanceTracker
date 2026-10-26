import { incomeUpdateSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson, toObjectId } from "@/server/http";
import { updateIncome } from "@/server/services/transaction-service";

export const PATCH = authedRoute<{ id: string }>(async ({ request, user, params }) => {
  const id = toObjectId(params.id, "Income");
  const input = parseWith(incomeUpdateSchema, await readJson(request));
  return json(await updateIncome(user.id, id, input));
});
