"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useAppData } from "@/components/app/app-data-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { apiRequest } from "@/lib/api-client";
import { toLocalDateTimeInput } from "@/lib/dates";
import type { TransactionDTO } from "@/lib/finance/types";
import { paiseToRupeeString } from "@/lib/money";
import { transferSchema, type TransferInput } from "@/lib/validation/schemas";
import { AmountField, DateTimeField, SelectField, TextAreaField, accountOptions } from "./fields";
import { handleFormError, useIdempotencyKey } from "./form-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The outgoing leg of an existing transfer to edit. */
  transfer?: TransactionDTO;
}

/** Move money between two of the user's own accounts. Never counts as income or expense. */
export function TransferFormDialog({ open, onOpenChange, transfer }: Props) {
  const router = useRouter();
  const { accounts, activeAccounts, settings } = useAppData();
  const [idempotencyKey, renewKey] = useIdempotencyKey();

  const form = useForm<TransferInput>({
    resolver: zodResolver(transferSchema),
    defaultValues: { fromAccountId: "", toAccountId: "", amount: "", effectiveAt: "", comment: "" },
  });

  // The outgoing leg's account is the source; for an incoming leg, swap.
  const fromId = transfer ? (transfer.type === "transfer_out" ? transfer.accountId : transfer.counterpartyAccountId) : "";
  const toId = transfer ? (transfer.type === "transfer_out" ? transfer.counterpartyAccountId : transfer.accountId) : "";

  useEffect(() => {
    if (!open) return;
    form.reset({
      fromAccountId: fromId ?? "",
      toAccountId: toId ?? "",
      amount: transfer ? paiseToRupeeString(transfer.amountPaise) : "",
      effectiveAt: toLocalDateTimeInput(transfer ? new Date(transfer.effectiveAt) : new Date(), settings.timezone),
      comment: transfer?.comment ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transfer]);

  const choices = accounts.filter((a) => !a.isArchived || a.id === fromId || a.id === toId);

  async function onSubmit(values: TransferInput) {
    try {
      if (transfer?.transferGroupId) {
        await apiRequest(`/api/transfers/${transfer.transferGroupId}`, {
          method: "PATCH",
          body: { ...values, version: transfer.version },
        });
        toast.success("Transfer updated");
      } else {
        const result = await apiRequest<{ duplicate: boolean }>("/api/transfers", {
          method: "POST",
          body: { ...values, idempotencyKey },
        });
        toast.success(result.duplicate ? "Already saved" : "Transfer recorded");
        renewKey();
      }
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      handleFormError(form, error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{transfer ? "Edit transfer" : "Transfer between accounts"}</DialogTitle>
          <DialogDescription>
            Moving money between your own accounts changes their balances but is not income or spending, so your
            savings stay the same.
          </DialogDescription>
        </DialogHeader>
        {activeAccounts.length < 2 && !transfer ? (
          <p className="text-sm">You need at least two active accounts to make a transfer.</p>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <SelectField
                control={form.control}
                name="fromAccountId"
                label="From"
                placeholder="Source account"
                options={accountOptions(choices)}
              />
              <SelectField
                control={form.control}
                name="toAccountId"
                label="To"
                placeholder="Destination account"
                options={accountOptions(choices)}
              />
              <AmountField control={form.control} name="amount" label="Amount (₹)" />
              <DateTimeField control={form.control} name="effectiveAt" label="Date & time" timezone={settings.timezone} />
              <TextAreaField control={form.control} name="comment" label="Note (optional)" />
            </FieldGroup>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : transfer ? "Save changes" : "Transfer"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
