"use client";

import { MoreHorizontal, Pencil, ReceiptText, Trash2, Undo2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/dates";
import type { TransactionDTO } from "@/lib/finance/types";
import { Money } from "./money";
import { RefundDialog } from "./refund-dialog";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { TransferFormDialog } from "./transfer-form-dialog";
import { TransactionTypeBadge, transactionTitle } from "./transaction-meta";

/** Row-level actions: details, edit, refund, delete (with confirmation). */
export function TransactionActions({ transaction }: { transaction: TransactionDTO }) {
  const router = useRouter();
  const { settings } = useAppData();
  const [panel, setPanel] = useState<"details" | "edit" | "refund" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const isTransfer = Boolean(transaction.transferGroupId);
  const isAdjustment = transaction.type === "adjustment";
  const canRefund = transaction.type === "expense" && transaction.refundedPaise < transaction.amountPaise;

  async function remove() {
    setBusy(true);
    try {
      await apiRequest(
        isTransfer ? `/api/transfers/${transaction.transferGroupId}` : `/api/transactions/${transaction.id}`,
        { method: "DELETE" },
      );
      toast.success(isTransfer ? "Transfer deleted from both accounts" : "Deleted");
      setPanel(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeRefund(refundId: string) {
    try {
      await apiRequest(`/api/expenses/${transaction.id}/refunds/${refundId}`, {
        method: "DELETE",
        body: { version: transaction.version },
      });
      toast.success("Refund removed");
      setPanel(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${transaction.name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setPanel("details")}>
            <ReceiptText /> View details
          </DropdownMenuItem>
          {!isAdjustment && (
            <DropdownMenuItem onSelect={() => setPanel("edit")}>
              <Pencil /> Edit
            </DropdownMenuItem>
          )}
          {canRefund && (
            <DropdownMenuItem onSelect={() => setPanel("refund")}>
              <Undo2 /> Record refund
            </DropdownMenuItem>
          )}
          {!isAdjustment && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setPanel("delete")}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={panel === "details"} onOpenChange={(open) => setPanel(open ? "details" : null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{transactionTitle(transaction)}</SheetTitle>
            <SheetDescription>
              <TransactionTypeBadge transaction={transaction} />
            </SheetDescription>
          </SheetHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 px-4 text-sm">
            <dt className="text-muted-foreground">Amount</dt>
            <dd>
              <Money paise={transaction.amountPaise} />
            </dd>
            {transaction.type === "expense" && transaction.refundedPaise > 0 && (
              <>
                <dt className="text-muted-foreground">Refunded</dt>
                <dd>
                  <Money paise={transaction.refundedPaise} />
                </dd>
                <dt className="text-muted-foreground">Net expense</dt>
                <dd className="font-medium">
                  <Money paise={transaction.netAmountPaise} />
                </dd>
              </>
            )}
            {transaction.categoryName && (
              <>
                <dt className="text-muted-foreground">Expense type</dt>
                <dd>{transaction.categoryName}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{isTransfer ? "Accounts" : "Account"}</dt>
            <dd>
              {isTransfer
                ? transaction.type === "transfer_out"
                  ? `${transaction.accountName} → ${transaction.counterpartyAccountName}`
                  : `${transaction.counterpartyAccountName} → ${transaction.accountName}`
                : transaction.accountName}
            </dd>
            <dt className="text-muted-foreground">Date</dt>
            <dd>{formatDateTime(new Date(transaction.effectiveAt), settings.timezone)}</dd>
            <dt className="text-muted-foreground">Recorded</dt>
            <dd>{formatDateTime(new Date(transaction.createdAt), settings.timezone)}</dd>
            {transaction.updatedAt !== transaction.createdAt && (
              <>
                <dt className="text-muted-foreground">Last edited</dt>
                <dd>{formatDateTime(new Date(transaction.updatedAt), settings.timezone)}</dd>
              </>
            )}
            {transaction.adjustmentReason && (
              <>
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{transaction.adjustmentReason}</dd>
              </>
            )}
            {transaction.comment && (
              <>
                <dt className="text-muted-foreground">Comment</dt>
                <dd className="whitespace-pre-wrap">{transaction.comment}</dd>
              </>
            )}
            {transaction.reference && (
              <>
                <dt className="text-muted-foreground">Reference</dt>
                <dd>{transaction.reference}</dd>
              </>
            )}
          </dl>
          {transaction.refunds.length > 0 && (
            <div className="space-y-2 px-4 pb-4">
              <h3 className="text-sm font-medium">Refunds</h3>
              <ul className="divide-y rounded-lg border text-sm">
                {transaction.refunds.map((refund) => (
                  <li key={refund.id} className="flex items-center justify-between gap-2 p-3">
                    <div>
                      <Money paise={refund.amountPaise} />
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(new Date(refund.refundedAt), settings.timezone)}
                        {refund.note ? ` · ${refund.note}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeRefund(refund.id)}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isAdjustment && (
            <p className="px-4 pb-4 text-xs text-muted-foreground">
              Balance adjustments are kept as a permanent audit trail. To undo one, record another adjustment.
            </p>
          )}
        </SheetContent>
      </Sheet>

      {(transaction.type === "expense" || transaction.type === "income") && (
        <TransactionFormDialog
          kind={transaction.type}
          transaction={transaction}
          open={panel === "edit"}
          onOpenChange={(open) => setPanel(open ? "edit" : null)}
        />
      )}
      {isTransfer && (
        <TransferFormDialog
          transfer={transaction}
          open={panel === "edit"}
          onOpenChange={(open) => setPanel(open ? "edit" : null)}
        />
      )}
      {canRefund && (
        <RefundDialog
          expense={transaction}
          open={panel === "refund"}
          onOpenChange={(open) => setPanel(open ? "refund" : null)}
        />
      )}

      <AlertDialog open={panel === "delete"} onOpenChange={(open) => setPanel(open ? "delete" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{transaction.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {isTransfer
                ? "Both sides of this transfer will be removed and the two account balances restored."
                : "Balances and reports will be recalculated without it. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

