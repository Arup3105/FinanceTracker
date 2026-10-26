import { accountCreateSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson } from "@/server/http";
import { createAccount, listAccounts } from "@/server/services/account-service";

export const GET = authedRoute(async ({ request, user }) => {
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  return json(await listAccounts(user.id, { includeArchived }));
});

export const POST = authedRoute(async ({ request, user }) => {
  const input = parseWith(accountCreateSchema, await readJson(request));
  return json(await createAccount(user.id, input), { status: 201 });
});
