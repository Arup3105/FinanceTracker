import { cashWithdrawalSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson } from "@/server/http";
import { recordCashWithdrawal } from "@/server/services/transaction-service";

export const POST = authedRoute(async ({ request, user }) => {
  const input = parseWith(cashWithdrawalSchema, await readJson(request));
  const result = await recordCashWithdrawal(user.id, input);
  return json(result, { status: result.duplicate ? 200 : 201 });
});
