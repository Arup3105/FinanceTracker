import { z } from "zod";
import { authedRoute, json, parseWith, readJson, toObjectId } from "@/server/http";
import { removeRefund } from "@/server/services/transaction-service";

const bodySchema = z.object({ version: z.number().int().nonnegative() });

export const DELETE = authedRoute<{ id: string; refundId: string }>(async ({ request, user, params }) => {
  const id = toObjectId(params.id, "Expense");
  const refundId = toObjectId(params.refundId, "Refund");
  const { version } = parseWith(bodySchema, await readJson(request));
  return json(await removeRefund(user.id, id, refundId, version));
});
