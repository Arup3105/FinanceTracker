import { describe, expect, it } from "vitest";
import { accountBalance, balanceEffect, periodTotals, type LedgerEntryLike } from "@/lib/finance/ledger";

const rupees = (value: number) => value * 100;

describe("ledger rules", () => {
  it("Test 1: an opening balance is balance, not income", () => {
    const entries: LedgerEntryLike[] = [];
    expect(accountBalance(rupees(10000), entries)).toBe(rupees(10000));
    expect(periodTotals(entries)).toEqual({ incomePaise: 0, expensePaise: 0, netSavingsPaise: 0 });
  });

  it("Test 2 & 3: income increases and expenses decrease the balance", () => {
    const income: LedgerEntryLike = { type: "income", amountPaise: rupees(25000) };
    const expense: LedgerEntryLike = { type: "expense", amountPaise: rupees(5000) };
    expect(accountBalance(rupees(10000), [income])).toBe(rupees(35000));
    expect(accountBalance(rupees(10000), [income, expense])).toBe(rupees(30000));
  });

  it("Test 4: net savings = income − expenses", () => {
    const totals = periodTotals([
      { type: "income", amountPaise: rupees(25000) },
      { type: "expense", amountPaise: rupees(5000) },
    ]);
    expect(totals).toEqual({ incomePaise: rupees(25000), expensePaise: rupees(5000), netSavingsPaise: rupees(20000) });
  });

  it("Test 5: transfers move money without changing totals", () => {
    const out: LedgerEntryLike = { type: "transfer_out", amountPaise: rupees(3000) };
    const inn: LedgerEntryLike = { type: "transfer_in", amountPaise: rupees(3000) };
    const a = accountBalance(rupees(20000), [out]);
    const b = accountBalance(rupees(5000), [inn]);
    expect(a).toBe(rupees(17000));
    expect(b).toBe(rupees(8000));
    expect(a + b).toBe(rupees(25000));
    expect(periodTotals([out, inn])).toEqual({ incomePaise: 0, expensePaise: 0, netSavingsPaise: 0 });
  });

  it("Test 6: a refund reduces the original expense once", () => {
    const expense: LedgerEntryLike = { type: "expense", amountPaise: rupees(1000), refundedPaise: rupees(300) };
    expect(balanceEffect(expense)).toBe(-rupees(700));
    expect(periodTotals([expense])).toEqual({ incomePaise: 0, expensePaise: rupees(700), netSavingsPaise: -rupees(700) });
  });

  it("adjustments change balances but never income or expenses", () => {
    const up: LedgerEntryLike = { type: "adjustment", amountPaise: 500, adjustmentDirection: "increase" };
    const down: LedgerEntryLike = { type: "adjustment", amountPaise: 200, adjustmentDirection: "decrease" };
    expect(accountBalance(0, [up, down])).toBe(300);
    expect(periodTotals([up, down])).toEqual({ incomePaise: 0, expensePaise: 0, netSavingsPaise: 0 });
  });

  it("negative net savings are valid", () => {
    expect(periodTotals([{ type: "expense", amountPaise: 100 }]).netSavingsPaise).toBe(-100);
  });
});
