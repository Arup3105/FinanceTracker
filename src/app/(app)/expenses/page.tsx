import type { Metadata } from "next";
import { TransactionsPage } from "@/components/finance/transactions-page";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  return <TransactionsPage kind="expense" searchParams={searchParams} />;
}
