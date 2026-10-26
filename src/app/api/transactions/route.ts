import { transactionListQuerySchema } from "@/lib/validation/schemas";
import { authedRoute, json } from "@/server/http";
import { listTransactions } from "@/server/services/transaction-service";

export const GET = authedRoute(async ({ request, user }) => {
  const query = transactionListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return json(await listTransactions(user.id, query));
});
