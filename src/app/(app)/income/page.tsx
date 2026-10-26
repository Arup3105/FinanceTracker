import type { Metadata } from "next";
import { TransactionsPage } from "@/components/finance/transactions-page";

export const metadata: Metadata = { title: "Income" };

export default function IncomePage({ searchParams }: PageProps<"/income">) {
  return <TransactionsPage kind="income" searchParams={searchParams} />;
}
