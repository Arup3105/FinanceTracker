import { authedRoute, json, toObjectId } from "@/server/http";
import { deleteTransaction, getTransaction } from "@/server/services/transaction-service";

type Params = { id: string };

export const GET = authedRoute<Params>(async ({ user, params }) => {
  return json(await getTransaction(user.id, toObjectId(params.id, "Transaction")));
});

export const DELETE = authedRoute<Params>(async ({ user, params }) => {
  await deleteTransaction(user.id, toObjectId(params.id, "Transaction"));
  return json({ deleted: true });
});
