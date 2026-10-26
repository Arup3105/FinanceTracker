import { settingsSchema } from "@/lib/validation/schemas";
import { authedRoute, json, parseWith, readJson } from "@/server/http";
import { getSettings, updateSettings } from "@/server/services/settings-service";

export const GET = authedRoute(async ({ user }) => json(await getSettings(user.id)));

export const PUT = authedRoute(async ({ request, user }) => {
  const input = parseWith(settingsSchema, await readJson(request));
  return json(await updateSettings(user.id, input));
});
