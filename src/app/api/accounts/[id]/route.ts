import { accountUpdateSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson, toObjectId } from "@/server/http";
import { deleteAccount, getAccount, updateAccount } from "@/server/services/account-service";

type Params = { id: string };

export const GET = authedRoute<Params>(async ({ user, params }) => {
  return json(await getAccount(user.id, toObjectId(params.id, "Account")));
});

export const PATCH = authedRoute<Params>(async ({ request, user, params }) => {
  const id = toObjectId(params.id, "Account");
  const input = parseWith(accountUpdateSchema, await readJson(request));
  return json(await updateAccount(user.id, id, input));
});

export const DELETE = authedRoute<Params>(async ({ user, params }) => {
  await deleteAccount(user.id, toObjectId(params.id, "Account"));
  return json({ deleted: true });
});
