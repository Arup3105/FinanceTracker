import type { Metadata } from "next";
import { TransactionsPage } from "@/components/finance/transactions-page";

export const metadata: Metadata = { title: "Transfers" };

export default function TransfersPage({ searchParams }: PageProps<"/transfers">) {
  return <TransactionsPage kind="transfer" searchParams={searchParams} />;
}
