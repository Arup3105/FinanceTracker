"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
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
import { expenseSchema, incomeSchema, type ExpenseInput, type IncomeInput } from "@/lib/validation/schemas";
import { AmountField, DateTimeField, SelectField, TextAreaField, TextField, accountOptions } from "./fields";
import { handleFormError, useIdempotencyKey } from "./form-utils";

type Kind = "expense" | "income";
type Values = ExpenseInput & IncomeInput;

interface Props {
  kind: Kind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided the dialog edits this entry instead of creating a new one. */
  transaction?: TransactionDTO;
}

/** Add or edit an expense / income entry. */
export function TransactionFormDialog({ kind, open, onOpenChange, transaction }: Props) {
  const router = useRouter();
  const { activeAccounts, accounts, activeExpenseTypes, expenseTypes, settings } = useAppData();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const isEdit = Boolean(transaction);
  const isExpense = kind === "expense";

  const form = useForm<Values>({
    resolver: zodResolver((isExpense ? expenseSchema : incomeSchema) as typeof expenseSchema),
    defaultValues: blankValues(),
  });

  function blankValues(): Values {
    return {
      name: "",
      amount: "",
      accountId: activeAccounts.length === 1 ? activeAccounts[0].id : "",
      categoryId: "",
      // Pre-filled with "now" each time the form opens; editable for historical entries.
      effectiveAt: toLocalDateTimeInput(new Date(), settings.timezone),
      comment: "",
      reference: "",
    };
  }

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      form.reset({
        name: transaction.name,
        amount: paiseToRupeeString(transaction.amountPaise),
        accountId: transaction.accountId,
        categoryId: transaction.categoryId ?? "",
        effectiveAt: toLocalDateTimeInput(new Date(transaction.effectiveAt), settings.timezone),
        comment: transaction.comment ?? "",
        reference: transaction.reference ?? "",
      });
    } else {
      form.reset(blankValues());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction]);

  // Archived accounts/types are hidden for new entries but kept when editing an entry that uses them.
  const accountChoices = accounts.filter((a) => !a.isArchived || a.id === transaction?.accountId);
  const typeChoices = expenseTypes.filter((t) => !t.isArchived || t.id === transaction?.categoryId);

  async function onSubmit(values: Values) {
    try {
      const body = isExpense
        ? values
        : { name: values.name, amount: values.amount, accountId: values.accountId, effectiveAt: values.effectiveAt, comment: values.comment };
      if (transaction) {
        await apiRequest(`/api/${isExpense ? "expenses" : "income"}/${transaction.id}`, {
          method: "PATCH",
          body: { ...body, version: transaction.version },
        });
        toast.success(`${isExpense ? "Expense" : "Income"} updated`);
      } else {
        const result = await apiRequest<{ duplicate: boolean }>(`/api/${isExpense ? "expenses" : "income"}`, {
          method: "POST",
          body: { ...body, idempotencyKey },
        });
        toast.success(result.duplicate ? "Already saved" : `${isExpense ? "Expense" : "Income"} added`);
        renewKey();
      }
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      handleFormError(form, error);
    }
  }

  const noAccounts = activeAccounts.length === 0 && !isEdit;
  const noTypes = isExpense && activeExpenseTypes.length === 0 && !isEdit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit" : "Add"} {isExpense ? "expense" : "income"}
          </DialogTitle>
          <DialogDescription>
            {isExpense
              ? "Money you spent. It reduces the selected account's balance."
              : "Money you received. It increases the selected account's balance."}
          </DialogDescription>
        </DialogHeader>

        {noAccounts || noTypes ? (
          <div className="space-y-3 text-sm">
            <p>
              {noAccounts
                ? "Add an account first (for example your bank account or cash wallet)."
                : "Add an expense type first."}
            </p>
            <Button asChild onClick={() => onOpenChange(false)}>
              <Link href={noAccounts ? "/accounts" : "/settings#expense-types"}>
                {noAccounts ? "Go to accounts" : "Manage expense types"}
              </Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <TextField
                control={form.control}
                name="name"
                label={isExpense ? "Expense name" : "Income name"}
                placeholder={isExpense ? "e.g. Groceries, Electricity bill, Lunch" : "e.g. Monthly salary, Freelance payment"}
                autoComplete="off"
                autoFocus
              />
              {isExpense && (
                <SelectField
                  control={form.control}
                  name="categoryId"
                  label="Expense type"
                  placeholder="Choose a type"
                  options={typeChoices.map((t) => ({ value: t.id, label: t.name }))}
                />
              )}
              <AmountField control={form.control} name="amount" label="Amount (₹)" />
              <SelectField
                control={form.control}
                name="accountId"
                label={isExpense ? "Paid from" : "Received in"}
                placeholder="Choose an account"
                options={accountOptions(accountChoices)}
              />
              <DateTimeField control={form.control} name="effectiveAt" label="Date & time" timezone={settings.timezone} />
              <TextAreaField control={form.control} name="comment" label="Comment (optional)" />
              {isExpense && (
                <TextField
                  control={form.control}
                  name="reference"
                  label="Reference (optional)"
                  placeholder="Bill no., UPI ref, etc."
                  autoComplete="off"
                />
              )}
            </FieldGroup>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : isEdit ? "Save changes" : `Add ${isExpense ? "expense" : "income"}`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
