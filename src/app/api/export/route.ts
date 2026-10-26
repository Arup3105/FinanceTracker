import { periodQuerySchema } from "@/lib/validation/schemas";
import { authedRoute } from "@/server/http";
import { buildReportCsv, streamTransactionsCsv } from "@/server/services/export-service";
import { resolvePeriod } from "@/server/services/report-service";
import { getSettings } from "@/server/services/settings-service";

/**
 * GET /api/export?type=transactions|report&scope=all|period&period=month&from=&to=
 * Always scoped to the authenticated user.
 */
export const GET = authedRoute(async ({ request, user }) => {
  const params = new URL(request.url).searchParams;
  const type = params.get("type") === "report" ? "report" : "transactions";
  const query = periodQuerySchema.parse(Object.fromEntries(params));
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" };

  if (type === "report") {
    const csv = await buildReportCsv(user.id, query);
    return new Response(csv, {
      headers: { ...headers, "Content-Disposition": `attachment; filename="finance-report-${stamp}.csv"` },
    });
  }

  const allTime = params.get("scope") !== "period";
  const range = allTime ? undefined : resolvePeriod(query, (await getSettings(user.id)).timezone);
  const stream = await streamTransactionsCsv(user.id, range);
  return new Response(stream, {
    headers: { ...headers, "Content-Disposition": `attachment; filename="finance-transactions-${stamp}.csv"` },
  });
});
