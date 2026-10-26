import { periodQuerySchema } from "@/lib/validation/schemas";
import { authedRoute, json } from "@/server/http";
import { getFinancialReport } from "@/server/services/report-service";

export const GET = authedRoute(async ({ request, user }) => {
  const query = periodQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return json(await getFinancialReport(user.id, query));
});
