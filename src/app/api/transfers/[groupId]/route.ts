import { transferUpdateSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson, toObjectId } from "@/server/http";
import { deleteTransfer, getTransfer, updateTransfer } from "@/server/services/transaction-service";

type Params = { groupId: string };

export const GET = authedRoute<Params>(async ({ user, params }) => {
  return json(await getTransfer(user.id, toObjectId(params.groupId, "Transfer")));
});

export const PATCH = authedRoute<Params>(async ({ request, user, params }) => {
  const groupId = toObjectId(params.groupId, "Transfer");
  const input = parseWith(transferUpdateSchema, await readJson(request));
  return json(await updateTransfer(user.id, groupId, input));
});

export const DELETE = authedRoute<Params>(async ({ user, params }) => {
  await deleteTransfer(user.id, toObjectId(params.groupId, "Transfer"));
  return json({ deleted: true });
});
