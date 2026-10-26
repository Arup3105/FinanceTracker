"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { formatINR } from "@/lib/money";
import { amountString, localDateTimeString } from "@/lib/validation/schemas";
import { AmountField, DateTimeField, TextField } from "./fields";
import { handleFormError } from "./form-utils";

const formSchema = z.object({ amount: amountString, refundedAt: localDateTimeString, note: z.string().max(200).optional() });
type Values = z.infer<typeof formSchema>;

/** Records a refund against an expense, reducing its net amount. */
export function RefundDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense: TransactionDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { settings } = useAppData();
  const remaining = expense.amountPaise - expense.refundedPaise;
  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: { amount: "", refundedAt: "", note: "" },
  });

  useEffect(() => {
    if (open) form.reset({ amount: "", refundedAt: toLocalDateTimeInput(new Date(), settings.timezone), note: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: Values) {
    try {
      await apiRequest(`/api/expenses/${expense.id}/refunds`, {
        method: "POST",
        body: { ...values, version: expense.version },
      });
      toast.success("Refund recorded");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      handleFormError(form, error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a refund</DialogTitle>
          <DialogDescription>
            The refund lowers this expense (and adds the money back to {expense.accountName}). It is not counted as
            income. Up to {formatINR(remaining)} can be refunded.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <AmountField control={form.control} name="amount" label="Refund amount (₹)" />
            <DateTimeField
              control={form.control}
              name="refundedAt"
              label="Refunded on"
              timezone={settings.timezone}
              description="For your records. The refund reduces the expense in the period of the original purchase."
            />
            <TextField control={form.control} name="note" label="Note (optional)" autoComplete="off" />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Record refund"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
