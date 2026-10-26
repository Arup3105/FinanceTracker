import { refundSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson, toObjectId } from "@/server/http";
import { addRefund } from "@/server/services/transaction-service";

export const POST = authedRoute<{ id: string }>(async ({ request, user, params }) => {
  const id = toObjectId(params.id, "Expense");
  const input = parseWith(refundSchema, await readJson(request));
  return json(await addRefund(user.id, id, input), { status: 201 });
});
