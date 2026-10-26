"use client";

import { ArrowLeftRight, Banknote, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CashWithdrawalDialog } from "./cash-withdrawal-dialog";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { TransferFormDialog } from "./transfer-form-dialog";

export function AddTransactionButton({ kind }: { kind: "expense" | "income" | "transfer" }) {
  const [open, setOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {kind === "expense" && (
        <Button variant="outline" onClick={() => setCashOpen(true)}>
          <Banknote /> ATM withdrawal
        </Button>
      )}
      <Button onClick={() => setOpen(true)}>
        {kind === "income" ? <Plus /> : kind === "expense" ? <Minus /> : <ArrowLeftRight />}
        {kind === "income" ? "Add income" : kind === "expense" ? "Add expense" : "New transfer"}
      </Button>
      {kind === "transfer" ? (
        <TransferFormDialog open={open} onOpenChange={setOpen} />
      ) : (
        <TransactionFormDialog kind={kind} open={open} onOpenChange={setOpen} />
      )}
      {kind === "expense" && <CashWithdrawalDialog open={cashOpen} onOpenChange={setCashOpen} />}
    </div>
  );
}
