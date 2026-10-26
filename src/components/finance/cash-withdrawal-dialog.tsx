"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
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
import { amountString, localDateTimeString, objectIdString } from "@/lib/validation/schemas";
import { AmountField, DateTimeField, SelectField, TextAreaField, accountOptions } from "./fields";
import { handleFormError, useIdempotencyKey } from "./form-utils";

const formSchema = z.object({
  accountId: objectIdString,
  cashAccountId: z.string().optional(),
  amount: amountString,
  effectiveAt: localDateTimeString,
  comment: z.string().max(500).optional(),
});
type Values = z.infer<typeof formSchema>;

/** Records an ATM withdrawal using the treatment chosen in Settings. */
export function CashWithdrawalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { activeAccounts, settings } = useAppData();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const transferMode = settings.cashWithdrawalMode === "transfer";
  const banks = activeAccounts.filter((a) => a.type !== "cash");
  const cashAccounts = activeAccounts.filter((a) => a.type === "cash");

  const form = useForm<Values>({
    resolver: zodResolver(
      transferMode
        ? formSchema.extend({ cashAccountId: objectIdString.refine(Boolean, "Choose a cash account.") })
        : formSchema,
    ),
    defaultValues: { accountId: "", cashAccountId: "", amount: "", effectiveAt: "", comment: "" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      accountId: banks.length === 1 ? banks[0].id : "",
      cashAccountId: cashAccounts.length === 1 ? cashAccounts[0].id : "",
      amount: "",
      effectiveAt: toLocalDateTimeInput(new Date(), settings.timezone),
      comment: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: Values) {
    try {
      const result = await apiRequest<{ duplicate: boolean }>("/api/cash-withdrawals", {
        method: "POST",
        body: { ...values, cashAccountId: transferMode ? values.cashAccountId : undefined, idempotencyKey },
      });
      toast.success(result.duplicate ? "Already saved" : "ATM withdrawal recorded");
      renewKey();
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
          <DialogTitle>ATM cash withdrawal</DialogTitle>
          <DialogDescription>
            {transferMode
              ? "Detailed cash tracking: the cash moves to your cash account (not an expense). Record each cash purchase as an expense from that account."
              : "Simple tracking: the withdrawal is counted as an expense right away. Don't record the things you buy with this cash again, or they'll be counted twice."}{" "}
            <Link href="/settings#preferences" className="underline underline-offset-4" onClick={() => onOpenChange(false)}>
              Change in Settings
            </Link>
          </DialogDescription>
        </DialogHeader>
        {transferMode && cashAccounts.length === 0 ? (
          <div className="space-y-3 text-sm">
            <p>Create an account of type “Cash” to receive withdrawals.</p>
            <Button asChild onClick={() => onOpenChange(false)}>
              <Link href="/accounts">Go to accounts</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <SelectField
                control={form.control}
                name="accountId"
                label="Withdrawn from"
                placeholder="Bank account"
                options={accountOptions(banks)}
              />
              {transferMode && (
                <SelectField
                  control={form.control}
                  name="cashAccountId"
                  label="Into cash account"
                  placeholder="Cash account"
                  options={accountOptions(cashAccounts)}
                />
              )}
              <AmountField control={form.control} name="amount" label="Amount (₹)" />
              <DateTimeField control={form.control} name="effectiveAt" label="Date & time" timezone={settings.timezone} />
              <TextAreaField control={form.control} name="comment" label="Note (optional)" />
            </FieldGroup>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Record withdrawal"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
