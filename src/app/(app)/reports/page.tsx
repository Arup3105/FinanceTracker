import type { Metadata } from "next";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { BreakdownList, IncomeExpenseChart, NetSavingsChart } from "@/components/finance/charts";
import { Money } from "@/components/finance/money";
import { PeriodSelector } from "@/components/finance/period-selector";
import { TransactionTable } from "@/components/finance/transaction-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, toLocalDateInput } from "@/lib/dates";
import type { PeriodSummary } from "@/lib/finance/types";
import { firstValues } from "@/lib/search-params";
import { periodQuerySchema, transactionListQuerySchema } from "@/lib/validation/schemas";
import { loadAppContext } from "@/server/app-context";
import { getFinancialReport } from "@/server/services/report-service";
import { listTransactions } from "@/server/services/transaction-service";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

function Change({ current, previous, goodWhenUp }: { current: number; previous: number; goodWhenUp: boolean }) {
  const delta = current - previous;
  if (delta === 0) return <span className="text-muted-foreground">No change</span>;
  const good = goodWhenUp ? delta > 0 : delta < 0;
  return (
    <span className={good ? "text-positive" : "text-negative"}>
      <Money paise={delta} signed />
    </span>
  );
}

function rate(summary: PeriodSummary) {
  return summary.savingsRate === null ? "—" : `${summary.savingsRate}%`;
}

async function Reports({ searchParams }: { searchParams: PageProps<"/reports">["searchParams"] }) {
  const raw = firstValues(await searchParams);
  const query = periodQuerySchema.parse(raw);
  const { user, settings } = await loadAppContext();
  const report = await getFinancialReport(user.id, query);
  const from = toLocalDateInput(new Date(report.range.start), settings.timezone);
  const to = toLocalDateInput(new Date(new Date(report.range.end).getTime() - 1), settings.timezone);
  const history = await listTransactions(
    user.id,
    transactionListQuerySchema.parse({ kind: "all", from, to, page: raw.page }),
  );
  const { summary, previousSummary } = report;
  const periodParams = new URLSearchParams({ period: query.period, ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}) });

  return (
    <>
      <PageHeader title="Reports" description="Analyse any period. Transfers between your accounts are excluded from income and expenses.">
        <PeriodSelector period={query.period} from={query.from} to={query.to} label={report.range.label} />
      </PageHeader>

      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/export?type=report&${periodParams}`}>
              <Download /> Report (CSV)
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/api/export?type=transactions&scope=period&${periodParams}`}>
              <Download /> Transactions in period (CSV)
            </a>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>Compared with the previous equivalent period</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">This period</TableHead>
                  <TableHead className="text-right">Previous period</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Income ({summary.incomeCount})</TableCell>
                  <TableCell className="text-right"><Money paise={summary.incomePaise} /></TableCell>
                  <TableCell className="text-right"><Money paise={previousSummary.incomePaise} /></TableCell>
                  <TableCell className="text-right"><Change current={summary.incomePaise} previous={previousSummary.incomePaise} goodWhenUp /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Expenses ({summary.expenseCount})</TableCell>
                  <TableCell className="text-right"><Money paise={summary.expensePaise} /></TableCell>
                  <TableCell className="text-right"><Money paise={previousSummary.expensePaise} /></TableCell>
                  <TableCell className="text-right"><Change current={summary.expensePaise} previous={previousSummary.expensePaise} goodWhenUp={false} /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Net savings</TableCell>
                  <TableCell className="text-right font-medium"><Money paise={summary.netSavingsPaise} tone="auto" /></TableCell>
                  <TableCell className="text-right"><Money paise={previousSummary.netSavingsPaise} tone="auto" /></TableCell>
                  <TableCell className="text-right"><Change current={summary.netSavingsPaise} previous={previousSummary.netSavingsPaise} goodWhenUp /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Savings rate</TableCell>
                  <TableCell className="text-right">{rate(summary)}</TableCell>
                  <TableCell className="text-right">{rate(previousSummary)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Income vs expenses over time</CardTitle>
            </CardHeader>
            <CardContent>
              <IncomeExpenseChart series={report.series} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Net savings over time</CardTitle>
            </CardHeader>
            <CardContent>
              <NetSavingsChart series={report.series} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Expenses by type</CardTitle>
            </CardHeader>
            <CardContent>
              <BreakdownList
                items={report.expenseByCategory.map((item) => ({
                  ...item,
                  href: `/expenses?from=${from}&to=${to}&categoryId=${item.key}`,
                }))}
                tone="expense"
                limit={12}
                emptyMessage="No expenses in this period."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Income by source</CardTitle>
            </CardHeader>
            <CardContent>
              <BreakdownList
                items={report.incomeBySource.map((item) => ({
                  ...item,
                  href: `/income?from=${from}&to=${to}&q=${encodeURIComponent(item.label)}`,
                }))}
                tone="income"
                limit={12}
                emptyMessage="No income in this period."
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Account activity</CardTitle>
              <CardDescription>Movements per account in this period</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {report.accountActivity.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No activity in this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Income</TableHead>
                      <TableHead className="text-right">Expenses</TableHead>
                      <TableHead className="text-right">Transfers in/out</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.accountActivity.map((a) => (
                      <TableRow key={a.accountId}>
                        <TableCell>{a.accountName}</TableCell>
                        <TableCell className="text-right"><Money paise={a.incomePaise} /></TableCell>
                        <TableCell className="text-right"><Money paise={a.expensePaise} /></TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          <Money paise={a.transferInPaise} /> / <Money paise={a.transferOutPaise} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Largest expenses</CardTitle>
            </CardHeader>
            <CardContent>
              {report.largestExpenses.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No expenses in this period.</p>
              ) : (
                <ol className="divide-y">
                  {report.largestExpenses.map((t, i) => (
                    <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="w-5 text-muted-foreground">{i + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{t.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.categoryName} · {formatDateTime(new Date(t.effectiveAt), settings.timezone)}
                        </p>
                      </div>
                      <Money paise={t.netAmountPaise} />
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Transactions in this period</h2>
          <TransactionTable data={history} emptyMessage="No transactions in this period." showType />
        </section>
      </div>
    </>
  );
}
