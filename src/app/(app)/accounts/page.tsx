import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Landmark } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/page-skeleton";
import { AccountList, AddAccountButton } from "@/components/finance/account-list";
import { Money } from "@/components/finance/money";
import { TransactionTable } from "@/components/finance/transaction-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { firstValues } from "@/lib/search-params";
import { transactionListQuerySchema } from "@/lib/validation/schemas";
import { loadAppContext } from "@/server/app-context";
import { listTransactions } from "@/server/services/transaction-service";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Accounts searchParams={searchParams} />
    </Suspense>
  );
}

async function Accounts({ searchParams }: { searchParams: PageProps<"/accounts">["searchParams"] }) {
  const raw = firstValues(await searchParams);
  const { user, accounts } = await loadAppContext();
  const selected = accounts.find((a) => a.id === raw.account);
  const total = accounts.reduce((sum, a) => sum + a.balancePaise, 0);
  const history = selected
    ? await listTransactions(
        user.id,
        transactionListQuerySchema.parse({ kind: "all", accountId: selected.id, page: raw.page }),
      )
    : null;

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Balances are calculated from each account's opening balance plus every entry recorded against it."
      >
        <AddAccountButton />
      </PageHeader>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No accounts yet"
          description="Add the places you keep money: bank accounts, a cash wallet, digital wallets or credit cards."
        >
          <AddAccountButton />
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <Card size="sm">
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total balance (all accounts)</span>
              <Money paise={total} tone="auto" className="text-xl font-semibold" />
            </CardContent>
          </Card>
          <AccountList />
          {selected && history && (
            <section className="space-y-3" id="history">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">History: {selected.name}</h2>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/accounts" scroll={false}>
                    Close
                  </Link>
                </Button>
              </div>
              <TransactionTable data={history} emptyMessage="No entries for this account yet." showType />
            </section>
          )}
        </div>
      )}
    </>
  );
}
