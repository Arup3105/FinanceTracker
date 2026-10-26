"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
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
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES } from "@/lib/finance/constants";
import type { AccountDTO } from "@/lib/finance/types";
import { formatINR, paiseToRupeeString } from "@/lib/money";
import {
  accountCreateSchema,
  adjustmentSchema,
  type AccountCreateInput,
} from "@/lib/validation/schemas";
import { AmountField, DateTimeField, SelectField, TextField } from "./fields";
import { handleFormError, useIdempotencyKey } from "./form-utils";

const adjustmentFormSchema = adjustmentSchema.omit({ idempotencyKey: true });
type AdjustmentValues = z.input<typeof adjustmentFormSchema>;

const typeOptions = ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }));

/** Create an account, or edit its details. The opening balance is only editable while it has no entries. */
export function AccountFormDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: AccountDTO;
}) {
  const router = useRouter();
  const openingLocked = Boolean(account?.hasTransactions);
  const form = useForm<AccountCreateInput>({
    resolver: zodResolver(accountCreateSchema),
    defaultValues: { name: "", type: "bank", openingBalance: "0" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      account
        ? { name: account.name, type: account.type, openingBalance: paiseToRupeeString(account.openingBalancePaise) }
        : { name: "", type: "bank", openingBalance: "" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account]);

  async function onSubmit(values: AccountCreateInput) {
    try {
      if (account) {
        await apiRequest(`/api/accounts/${account.id}`, {
          method: "PATCH",
          body: {
            name: values.name,
            type: values.type,
            ...(openingLocked ? {} : { openingBalance: values.openingBalance }),
            version: account.version,
          },
        });
        toast.success("Account updated");
      } else {
        await apiRequest("/api/accounts", { method: "POST", body: values });
        toast.success("Account created");
      }
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
          <DialogTitle>{account ? "Edit account" : "Add an account"}</DialogTitle>
          <DialogDescription>
            Never enter bank passwords, card numbers, CVVs or UPI PINs. A name like “HDFC Salary” is enough.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <TextField control={form.control} name="name" label="Account name" placeholder="e.g. SBI Savings, Cash wallet" autoComplete="off" autoFocus />
            <SelectField control={form.control} name="type" label="Account type" placeholder="Choose a type" options={typeOptions} />
            {openingLocked ? (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                Opening balance: {formatINR(account!.openingBalancePaise)}. It is locked because this account already has
                transactions; use “Correct balance” to record an adjustment instead.
              </p>
            ) : (
              <AmountField
                control={form.control}
                name="openingBalance"
                label="Opening balance (₹)"
                allowNegative
                description="How much is in this account today, before you start tracking. This is not counted as income. For a credit card, enter what you owe as a negative number."
              />
            )}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : account ? "Save changes" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Records an audited balance adjustment that brings the account to its real balance. */
export function AdjustmentDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountDTO;
}) {
  const router = useRouter();
  const { settings } = useAppData();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const form = useForm<AdjustmentValues>({
    resolver: zodResolver(adjustmentFormSchema),
    defaultValues: { targetBalance: "", reason: "", effectiveAt: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        targetBalance: paiseToRupeeString(account.balancePaise),
        reason: "",
        effectiveAt: toLocalDateTimeInput(new Date(), settings.timezone),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: AdjustmentValues) {
    try {
      await apiRequest(`/api/accounts/${account.id}/adjustments`, {
        method: "POST",
        body: { ...values, idempotencyKey },
      });
      toast.success("Balance corrected");
      renewKey();
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
          <DialogTitle>Correct balance: {account.name}</DialogTitle>
          <DialogDescription>
            Current calculated balance is {formatINR(account.balancePaise)}. Enter the real balance and we&apos;ll record a dated
            adjustment for the difference. Your past entries and opening balance stay unchanged, and the adjustment is not
            counted as income or expense.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <AmountField control={form.control} name="targetBalance" label="Actual balance (₹)" allowNegative />
            <TextField control={form.control} name="reason" label="Reason" placeholder="e.g. Bank charges I didn't record" autoComplete="off" />
            <DateTimeField control={form.control} name="effectiveAt" label="As of" timezone={settings.timezone} />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Record adjustment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
