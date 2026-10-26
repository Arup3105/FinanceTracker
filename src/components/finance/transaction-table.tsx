"use client";

import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import type { Paginated, TransactionDTO } from "@/lib/finance/types";
import { TransactionActions } from "./transaction-details";
import { TransactionAmount, TransactionTypeBadge, transactionTitle } from "./transaction-meta";

const ALL = "__all";

/** URL-driven filters: every change re-renders the server page with a new query. */
export function TransactionFilters({ kind }: { kind: "expense" | "income" | "transfer" | "all" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { accounts, expenseTypes } = useAppData();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== ALL) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  const hasFilters = ["q", "accountId", "categoryId", "from", "to"].some((k) => searchParams.get(k));

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center" aria-busy={pending}>
      <form
        className="relative lg:w-64"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() || undefined });
        }}
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search by name, comment or reference"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => q.trim() !== (searchParams.get("q") ?? "") && update({ q: q.trim() || undefined })}
          className="pl-8"
        />
      </form>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Select value={searchParams.get("accountId") ?? ALL} onValueChange={(v) => update({ accountId: v })}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by account">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
                {a.isArchived ? " (archived)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {kind === "expense" && (
          <Select value={searchParams.get("categoryId") ?? ALL} onValueChange={(v) => update({ categoryId: v })}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by expense type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All expense types</SelectItem>
              {expenseTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          type="date"
          aria-label="From date"
          className="w-full sm:w-38"
          value={searchParams.get("from") ?? ""}
          onChange={(e) => update({ from: e.target.value || undefined })}
        />
        <Input
          type="date"
          aria-label="To date"
          className="w-full sm:w-38"
          value={searchParams.get("to") ?? ""}
          onChange={(e) => update({ to: e.target.value || undefined })}
        />
        <Select value={searchParams.get("sort") ?? "date_desc"} onValueChange={(v) => update({ sort: v === "date_desc" ? undefined : v })}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Newest first</SelectItem>
            <SelectItem value="date_asc">Oldest first</SelectItem>
            <SelectItem value="amount_desc">Largest amount</SelectItem>
            <SelectItem value="amount_asc">Smallest amount</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setQ("");
              update({ q: undefined, accountId: undefined, categoryId: undefined, from: undefined, to: undefined });
            }}
          >
            <X /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}

export function TransactionTable({
  data,
  emptyMessage,
  showType = false,
}: {
  data: Paginated<TransactionDTO>;
  emptyMessage: string;
  showType?: boolean;
}) {
  const { settings } = useAppData();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function pageHref(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) params.delete("page");
    else params.set("page", String(page));
    return `${pathname}?${params.toString()}`;
  }

  if (data.items.length === 0) {
    return <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Desktop table */}
      <div className="hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {showType && <TableHead>Type</TableHead>}
              <TableHead>Account</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="max-w-72">
                  <p className="truncate font-medium">{transactionTitle(t)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[t.categoryName, t.comment].filter(Boolean).join(" · ") || (showType ? "" : " ")}
                  </p>
                </TableCell>
                {showType && (
                  <TableCell>
                    <TransactionTypeBadge transaction={t} />
                  </TableCell>
                )}
                <TableCell className="text-muted-foreground">{t.accountName}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateTime(new Date(t.effectiveAt), settings.timezone)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  <TransactionAmount transaction={t} />
                </TableCell>
                <TableCell>
                  <TransactionActions transaction={t} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile list */}
      <ul className="divide-y rounded-xl border md:hidden">
        {data.items.map((t) => (
          <li key={t.id} className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{transactionTitle(t)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[t.categoryName, t.accountName].filter(Boolean).join(" · ")}
              </p>
              <p className="text-xs text-muted-foreground">{formatDateTime(new Date(t.effectiveAt), settings.timezone)}</p>
            </div>
            <div className="text-right text-sm font-medium">
              <TransactionAmount transaction={t} />
            </div>
            <TransactionActions transaction={t} />
          </li>
        ))}
      </ul>

      {data.totalPages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-muted-foreground">
            Page {data.page} of {data.totalPages} · {data.total} entries
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild disabled={data.page <= 1}>
              {data.page <= 1 ? (
                <span aria-disabled="true">
                  <ChevronLeft /> Previous
                </span>
              ) : (
                <Link href={pageHref(data.page - 1)} scroll={false}>
                  <ChevronLeft /> Previous
                </Link>
              )}
            </Button>
            <Button variant="outline" size="sm" asChild disabled={data.page >= data.totalPages}>
              {data.page >= data.totalPages ? (
                <span aria-disabled="true">
                  Next <ChevronRight />
                </span>
              ) : (
                <Link href={pageHref(data.page + 1)} scroll={false}>
                  Next <ChevronRight />
                </Link>
              )}
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}

/** Compact list for the dashboard's recent activity. */
export function RecentActivity({ items }: { items: TransactionDTO[] }) {
  const { settings } = useAppData();
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No transactions yet. Add your first income or expense.</p>;
  }
  return (
    <ul className="divide-y">
      {items.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{transactionTitle(t)}</p>
              <span className="hidden sm:inline">
                <TransactionTypeBadge transaction={t} />
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {[t.categoryName, t.accountName, formatDateTime(new Date(t.effectiveAt), settings.timezone)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="text-right text-sm font-medium">
            <TransactionAmount transaction={t} />
          </div>
          <TransactionActions transaction={t} />
        </li>
      ))}
    </ul>
  );
}
