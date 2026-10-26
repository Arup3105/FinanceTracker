import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/page-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { firstValues, type RawSearchParams } from "@/lib/search-params";
import { formatINR } from "@/lib/money";
import { transactionListQuerySchema } from "@/lib/validation/schemas";
import { loadAppContext } from "@/server/app-context";
import { listTransactions, sumTransactions } from "@/server/services/transaction-service";
import { AddTransactionButton } from "./add-transaction-button";
import { TransactionFilters, TransactionTable } from "./transaction-table";

type Kind = "expense" | "income" | "transfer";

const COPY: Record<Kind, { title: string; description: string; total: string; empty: string }> = {
  expense: {
    title: "Expenses",
    description: "Money you spent. Search, filter, edit, refund or delete any expense.",
    total: "Total spent (net of refunds)",
    empty: "No expenses match. Use “Add expense” to record one.",
  },
  income: {
    title: "Income",
    description: "Money you received: salary, freelance payments, interest, gifts and more.",
    total: "Total received",
    empty: "No income matches. Use “Add income” whenever you receive money.",
  },
  transfer: {
    title: "Transfers",
    description:
      "Money moved between your own accounts. Transfers change account balances but are never counted as income, expenses or savings.",
    total: "Total moved",
    empty: "No transfers yet.",
  },
};

/** Server-rendered, paginated list page for one kind of entry. */
export function TransactionsPage({ kind, searchParams }: { kind: Kind; searchParams: Promise<RawSearchParams> }) {
  const copy = COPY[kind];
  return (
    <>
      <PageHeader title={copy.title} description={copy.description}>
        <AddTransactionButton kind={kind} />
      </PageHeader>
      <div className="space-y-4">
        <Suspense>
          <TransactionFilters kind={kind} />
        </Suspense>
        <Suspense fallback={<TableSkeleton />}>
          <Results kind={kind} searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function Results({ kind, searchParams }: { kind: Kind; searchParams: Promise<RawSearchParams> }) {
  const raw = firstValues(await searchParams);
  const query = transactionListQuerySchema.parse({ ...raw, kind });
  const { user } = await loadAppContext();
  const [data, totalPaise] = await Promise.all([listTransactions(user.id, query), sumTransactions(user.id, query)]);
  const exportParams = new URLSearchParams({ type: "transactions" });

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">
              {COPY[kind].total}
              {raw.from || raw.to || raw.q || raw.accountId || raw.categoryId ? " · filtered" : " · all time"}
            </p>
            <p className="text-xl font-semibold tabular-nums">{formatINR(totalPaise)}</p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{data.total} entries</span>
            <a className="underline underline-offset-4 hover:text-foreground" href={`/api/export?${exportParams}`}>
              Export CSV
            </a>
          </div>
        </CardContent>
      </Card>
      <TransactionTable data={data} emptyMessage={COPY[kind].empty} />
    </div>
  );
}
