"use client";

import { Archive, ArchiveRestore, History, MoreHorizontal, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useAppData } from "@/components/app/app-data-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest, errorMessage } from "@/lib/api-client";
import { ACCOUNT_TYPE_LABELS } from "@/lib/finance/constants";
import type { AccountDTO } from "@/lib/finance/types";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AccountFormDialog, AdjustmentDialog } from "./account-dialogs";

export function AddAccountButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Add account
      </Button>
      <AccountFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function AccountCard({ account }: { account: AccountDTO }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "adjust" | "archive" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setDialog(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const toggleArchive = () =>
    run(
      () =>
        apiRequest(`/api/accounts/${account.id}`, {
          method: "PATCH",
          body: { isArchived: !account.isArchived, version: account.version },
        }),
      account.isArchived ? "Account restored" : "Account archived",
    );

  return (
    <Card id={account.id} className={cn(account.isArchived && "opacity-70")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {account.name}
          {account.isArchived && <Badge variant="outline">Archived</Badge>}
        </CardTitle>
        <CardDescription>{ACCOUNT_TYPE_LABELS[account.type]}</CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Actions for ${account.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/accounts?account=${account.id}`} scroll={false}>
                  <History /> View history
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("edit")}>
                <Pencil /> Edit details
              </DropdownMenuItem>
              {!account.isArchived && (
                <DropdownMenuItem onSelect={() => setDialog("adjust")}>
                  <Scale /> Correct balance
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {account.isArchived ? (
                <DropdownMenuItem onSelect={() => void toggleArchive()}>
                  <ArchiveRestore /> Restore
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setDialog("archive")}>
                  <Archive /> Archive
                </DropdownMenuItem>
              )}
              {!account.hasTransactions && (
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className={cn("text-2xl font-semibold tabular-nums", account.balancePaise < 0 && "text-negative")}>
          {formatINR(account.balancePaise)}
        </p>
        <p className="text-xs text-muted-foreground">Opening balance {formatINR(account.openingBalancePaise)}</p>
      </CardContent>

      <AccountFormDialog account={account} open={dialog === "edit"} onOpenChange={(o) => setDialog(o ? "edit" : null)} />
      {!account.isArchived && (
        <AdjustmentDialog account={account} open={dialog === "adjust"} onOpenChange={(o) => setDialog(o ? "adjust" : null)} />
      )}
      <AlertDialog open={dialog === "archive"} onOpenChange={(o) => setDialog(o ? "archive" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive “{account.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its history is kept and still appears in reports, but you won&apos;t be able to add new entries to it.
              {account.balancePaise !== 0 &&
                ` It still holds ${formatINR(account.balancePaise)}, which stays in your total balance; transfer it out first if the account is closed.`}{" "}
              You can restore it any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void toggleArchive();
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={dialog === "delete"} onOpenChange={(o) => setDialog(o ? "delete" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{account.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This account has no transactions, so nothing else is affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void run(() => apiRequest(`/api/accounts/${account.id}`, { method: "DELETE" }), "Account deleted");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function AccountList() {
  const { accounts } = useAppData();
  const active = accounts.filter((a) => !a.isArchived);
  const archived = accounts.filter((a) => a.isArchived);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {active.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>
      {archived.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Archived</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {archived.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
