import { Badge } from "@/components/ui/badge";
import type { TransactionDTO } from "@/lib/finance/types";
import { Money } from "./money";

export function transactionTitle(t: TransactionDTO): string {
  if (t.transferGroupId) {
    const from = t.type === "transfer_out" ? t.accountName : t.counterpartyAccountName;
    const to = t.type === "transfer_out" ? t.counterpartyAccountName : t.accountName;
    return `${t.name}: ${from} → ${to}`;
  }
  return t.name;
}

export function TransactionTypeBadge({ transaction: t }: { transaction: TransactionDTO }) {
  if (t.transferGroupId) return <Badge variant="secondary">{t.isCashWithdrawal ? "ATM → cash" : "Transfer"}</Badge>;
  if (t.type === "income") return <Badge className="bg-income/15 text-positive">Income</Badge>;
  if (t.type === "expense")
    return (
      <Badge className="bg-expense/15 text-negative">
        {t.refundedPaise > 0 ? (t.refundedPaise === t.amountPaise ? "Expense · refunded" : "Expense · part refunded") : "Expense"}
      </Badge>
    );
  return <Badge variant="outline">Adjustment</Badge>;
}

/** Amount with sign and color from the perspective of the row's account. */
export function TransactionAmount({ transaction: t, perspective = "list" }: { transaction: TransactionDTO; perspective?: "list" | "account" }) {
  switch (t.type) {
    case "income":
      return <Money paise={t.amountPaise} tone="income" signed />;
    case "expense":
      return (
        <span className="flex flex-col items-end">
          <Money paise={-t.netAmountPaise} tone="expense" />
          {t.refundedPaise > 0 && (
            <span className="text-xs text-muted-foreground line-through tabular-nums">
              <Money paise={-t.amountPaise} />
            </span>
          )}
        </span>
      );
    case "transfer_out":
      return perspective === "account" ? <Money paise={-t.amountPaise} /> : <Money paise={t.amountPaise} />;
    case "transfer_in":
      return <Money paise={t.amountPaise} signed />;
    case "adjustment":
      return <Money paise={t.adjustmentDirection === "decrease" ? -t.amountPaise : t.amountPaise} signed />;
  }
}
