"use client";

import { createContext, useContext, useMemo } from "react";
import type { AccountDTO, ExpenseTypeDTO, SettingsDTO } from "@/lib/finance/types";

export interface AppData {
  user: { id: string; name: string; email: string };
  accounts: AccountDTO[];
  expenseTypes: ExpenseTypeDTO[];
  settings: SettingsDTO;
}

interface AppDataValue extends AppData {
  activeAccounts: AccountDTO[];
  activeExpenseTypes: ExpenseTypeDTO[];
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ value, children }: { value: AppData; children: React.ReactNode }) {
  const memo = useMemo<AppDataValue>(
    () => ({
      ...value,
      activeAccounts: value.accounts.filter((a) => !a.isArchived),
      activeExpenseTypes: value.expenseTypes.filter((t) => !t.isArchived),
    }),
    [value],
  );
  return <AppDataContext value={memo}>{children}</AppDataContext>;
}

export function useAppData(): AppDataValue {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData must be used inside AppDataProvider");
  return value;
}
