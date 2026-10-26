import { transferCreateSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson } from "@/server/http";
import { createTransfer } from "@/server/services/transaction-service";

export const POST = authedRoute(async ({ request, user }) => {
  const input = parseWith(transferCreateSchema, await readJson(request));
  const result = await createTransfer(user.id, input);
  return json(result, { status: result.duplicate ? 200 : 201 });
});
