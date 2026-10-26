import { adjustmentSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson, toObjectId } from "@/server/http";
import { createAdjustment } from "@/server/services/account-service";

export const POST = authedRoute<{ id: string }>(async ({ request, user, params }) => {
  const id = toObjectId(params.id, "Account");
  const input = parseWith(adjustmentSchema, await readJson(request));
  return json(await createAdjustment(user.id, id, input), { status: 201 });
});
