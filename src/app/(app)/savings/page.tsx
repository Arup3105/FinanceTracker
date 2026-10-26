import type { Metadata } from "next";
import { Suspense } from "react";
import { Info, Landmark, PiggyBank, Receipt, TrendingUp, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { AccountBalanceList, BalanceTrendChart, IncomeExpenseChart, NetSavingsChart } from "@/components/finance/charts";
import { PeriodSelector } from "@/components/finance/period-selector";
import { StatCard } from "@/components/finance/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/money";
import { firstValues } from "@/lib/search-params";
import { periodQuerySchema } from "@/lib/validation/schemas";
import { loadAppContext } from "@/server/app-context";
import { getFinancialReport, getMonthlyTrend, getOpeningBalanceTotal } from "@/server/services/report-service";

export const metadata: Metadata = { title: "Savings" };

export default function SavingsPage({ searchParams }: PageProps<"/savings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Savings searchParams={searchParams} />
    </Suspense>
  );
}

async function Savings({ searchParams }: { searchParams: PageProps<"/savings">["searchParams"] }) {
  const query = periodQuerySchema.parse(firstValues(await searchParams));
  const { user, accounts } = await loadAppContext();
  const [report, trend, openingTotal] = await Promise.all([
    getFinancialReport(user.id, query),
    getMonthlyTrend(user.id),
    getOpeningBalanceTotal(user.id),
  ]);
  const { summary, previousSummary } = report;
  const totalBalance = accounts.reduce((sum, a) => sum + a.balancePaise, 0);
  const trendNet = trend.reduce((sum, p) => sum + p.netPaise, 0);

  return (
    <>
      <PageHeader
        title="Savings"
        description="Calculated automatically from your income and expenses. There is nothing to enter here."
      >
        <PeriodSelector period={query.period} from={query.from} to={query.to} label={report.range.label} />
      </PageHeader>

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Net savings this period"
            paise={summary.netSavingsPaise}
            previousPaise={previousSummary.netSavingsPaise}
            icon={PiggyBank}
            accent="savings"
            valueTone="auto"
            hint={
              summary.savingsRate === null
                ? "No income this period, so there is no savings rate"
                : `Savings rate ${summary.savingsRate}%`
            }
          />
          <StatCard title="Income this period" paise={summary.incomePaise} icon={TrendingUp} accent="income" />
          <StatCard title="Expenses this period" paise={summary.expensePaise} icon={Receipt} accent="expense" />
          <StatCard
            title="Current total balance"
            paise={totalBalance}
            icon={Wallet}
            accent="neutral"
            valueTone="auto"
            hint="Money available across all accounts now"
          />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-start gap-3">
            <Info className="mt-0.5 size-4 shrink-0 text-savings" />
            <div className="space-y-1">
              <CardTitle className="text-base">How these numbers differ</CardTitle>
              <CardDescription>Four related figures that are easy to mix up:</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium">Net savings ({formatINR(summary.netSavingsPaise)})</dt>
                <dd className="text-muted-foreground">
                  Income minus expenses for the selected period only. Transfers between your accounts and opening
                  balances are not included. It can be negative if you spent more than you earned.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Current total balance ({formatINR(totalBalance)})</dt>
                <dd className="text-muted-foreground">
                  What all your accounts hold right now: opening balances plus every income, expense, refund and
                  balance correction ever recorded.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Opening balances ({formatINR(openingTotal)})</dt>
                <dd className="text-muted-foreground">
                  Money that was already in your accounts when you started tracking. It is part of your balance, but it
                  is never counted as income or savings.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Cumulative position ({formatINR(totalBalance - openingTotal)})</dt>
                <dd className="text-muted-foreground">
                  How much your combined balance has changed since you started tracking (current total balance minus
                  opening balances).
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Net savings over {report.range.label}</CardTitle>
              <CardDescription>Blue bars are saved money; orange bars mean you spent more than you earned</CardDescription>
            </CardHeader>
            <CardContent>
              <NetSavingsChart series={report.series} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Balance trend</CardTitle>
              <CardDescription>Combined balance at the end of each step</CardDescription>
            </CardHeader>
            <CardContent>
              <BalanceTrendChart series={report.series} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Last 12 months</CardTitle>
              <CardDescription>
                Monthly income and expenses · {formatINR(trendNet)} saved in total
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IncomeExpenseChart series={trend} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="size-4" /> Where your money is
              </CardTitle>
              <CardDescription>Balance by account</CardDescription>
            </CardHeader>
            <CardContent>
              <AccountBalanceList accounts={accounts} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Monthly savings history</CardTitle>
            <CardDescription>Net savings per month for the last 12 months</CardDescription>
          </CardHeader>
          <CardContent>
            <NetSavingsChart series={trend} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
