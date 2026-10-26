import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Landmark, PiggyBank, Receipt, TrendingUp, Wallet } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import {
  AccountBalanceList,
  BalanceTrendChart,
  BreakdownList,
  IncomeExpenseChart,
  PeriodComparisonChart,
} from "@/components/finance/charts";
import { PeriodSelector } from "@/components/finance/period-selector";
import { StatCard } from "@/components/finance/stat-card";
import { RecentActivity } from "@/components/finance/transaction-table";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toLocalDateInput } from "@/lib/dates";
import { firstValues } from "@/lib/search-params";
import { periodQuerySchema } from "@/lib/validation/schemas";
import { loadAppContext } from "@/server/app-context";
import { getFinancialReport } from "@/server/services/report-service";
import { recentTransactions } from "@/server/services/transaction-service";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const query = periodQuerySchema.parse(firstValues(await searchParams));
  const { user, accounts } = await loadAppContext();
  const [report, recent] = await Promise.all([getFinancialReport(user.id, query), recentTransactions(user.id)]);
  const { summary, previousSummary } = report;
  const totalBalance = accounts.reduce((sum, a) => sum + a.balancePaise, 0);
  const { settings } = await loadAppContext();
  const periodQueryString = new URLSearchParams(firstValues(await searchParams)).toString();
  const withPeriod = (path: string) => (periodQueryString ? `${path}?${periodQueryString}` : path);
  // Expense/income lists filter by date, so pass the period as an explicit date range.
  const rangeQuery = new URLSearchParams({
    from: toLocalDateInput(new Date(report.range.start), settings.timezone),
    to: toLocalDateInput(new Date(new Date(report.range.end).getTime() - 1), settings.timezone),
  }).toString();
  const withRange = (path: string, extra = "") => `${path}?${rangeQuery}${extra}`;

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} description="Your money at a glance.">
        <PeriodSelector period={query.period} from={query.from} to={query.to} label={report.range.label} />
      </PageHeader>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Add your first account to get started"
          description="An account is anywhere you keep money: a bank account, a cash wallet or a credit card. Enter how much is in it today; that becomes its opening balance (it is not counted as income)."
        >
          <Button asChild>
            <Link href="/accounts">Add an account</Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Total balance"
              paise={totalBalance}
              icon={Wallet}
              accent="neutral"
              valueTone="auto"
              href="/accounts"
              hint={`Across ${accounts.filter((a) => !a.isArchived).length} active account(s), right now`}
            />
            <StatCard
              title="Income"
              paise={summary.incomePaise}
              previousPaise={previousSummary.incomePaise}
              icon={TrendingUp}
              accent="income"
              href={withRange("/income")}
            />
            <StatCard
              title="Expenses"
              paise={summary.expensePaise}
              previousPaise={previousSummary.expensePaise}
              goodWhenUp={false}
              icon={Receipt}
              accent="expense"
              href={withRange("/expenses")}
            />
            <StatCard
              title="Net savings"
              paise={summary.netSavingsPaise}
              previousPaise={previousSummary.netSavingsPaise}
              icon={PiggyBank}
              accent="savings"
              valueTone="auto"
              href={withPeriod("/savings")}
              hint={
                summary.savingsRate === null
                  ? "Savings rate appears once you record income"
                  : `Savings rate ${summary.savingsRate}% of income`
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Income vs expenses</CardTitle>
                <CardDescription>This period compared with the previous one</CardDescription>
              </CardHeader>
              <CardContent>
                <PeriodComparisonChart current={summary} previous={previousSummary} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
                <CardDescription>Income and expenses over {report.range.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <IncomeExpenseChart series={report.series} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Spending by expense type</CardTitle>
                <CardAction>
                  <Button variant="link" size="sm" asChild>
                    <Link href={withRange("/expenses")}>View expenses</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <BreakdownList
                  items={report.expenseByCategory.map((item) => ({
                    ...item,
                    href: withRange("/expenses", `&categoryId=${item.key}`),
                  }))}
                  tone="expense"
                  emptyMessage="No expenses in this period."
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Income by source</CardTitle>
                <CardAction>
                  <Button variant="link" size="sm" asChild>
                    <Link href={withRange("/income")}>View income</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <BreakdownList
                  items={report.incomeBySource.map((item) => ({
                    ...item,
                    href: withRange("/income", `&q=${encodeURIComponent(item.label)}`),
                  }))}
                  tone="income"
                  emptyMessage="No income in this period."
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Balance trend</CardTitle>
                <CardDescription>Combined balance of all accounts over time</CardDescription>
                <CardAction>
                  <Button variant="link" size="sm" asChild>
                    <Link href={withPeriod("/savings")}>Savings</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <BalanceTrendChart series={report.series} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Account balances</CardTitle>
                <CardAction>
                  <Button variant="link" size="sm" asChild>
                    <Link href="/accounts">Manage</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <AccountBalanceList accounts={accounts} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardAction>
                <Button variant="link" size="sm" asChild>
                  <Link href="/reports">All transactions</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <RecentActivity items={recent} />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
