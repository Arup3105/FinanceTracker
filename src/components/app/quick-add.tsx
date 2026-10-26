"use client";

import { ArrowLeftRight, Banknote, ChevronDown, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { CashWithdrawalDialog } from "@/components/finance/cash-withdrawal-dialog";
import { TransactionFormDialog } from "@/components/finance/transaction-form-dialog";
import { TransferFormDialog } from "@/components/finance/transfer-form-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Dialog = "expense" | "income" | "transfer" | "cash" | null;

/** Header shortcuts for recording money movements from any page. */
export function QuickAdd({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState<Dialog>(null);
  const setter = (name: Dialog) => (value: boolean) => setOpen(value ? name : null);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button size={compact ? "sm" : "default"} variant="outline" onClick={() => setOpen("income")}>
          <Plus /> Income
        </Button>
        <Button size={compact ? "sm" : "default"} onClick={() => setOpen("expense")}>
          <Minus /> Expense
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size={compact ? "icon-sm" : "icon"} variant="outline" aria-label="More actions">
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setOpen("transfer")}>
              <ArrowLeftRight /> Transfer between accounts
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpen("cash")}>
              <Banknote /> ATM cash withdrawal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TransactionFormDialog kind="expense" open={open === "expense"} onOpenChange={setter("expense")} />
      <TransactionFormDialog kind="income" open={open === "income"} onOpenChange={setter("income")} />
      <TransferFormDialog open={open === "transfer"} onOpenChange={setter("transfer")} />
      <CashWithdrawalDialog open={open === "cash"} onOpenChange={setter("cash")} />
    </>
  );
}
