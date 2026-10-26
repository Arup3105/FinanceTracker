import Link from "next/link";
import { ArrowLeftRight, PiggyBank, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Wallet,
    title: "All your accounts",
    text: "Bank accounts, cash and cards with balances calculated from every entry.",
  },
  {
    icon: PiggyBank,
    title: "Savings, worked out for you",
    text: "Net savings and savings rate come straight from your real income and expenses.",
  },
  {
    icon: ArrowLeftRight,
    title: "Transfers done right",
    text: "Moving money between your own accounts never counts as income or spending.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    text: "Your records are only ever visible to you. No bank passwords required.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-4" />
          </span>
          Finance Tracker
        </span>
        <nav className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </nav>
      </header>
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-4 py-12">
        <div className="max-w-2xl space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Know where every rupee goes.</h1>
          <p className="text-lg text-muted-foreground">
            Record income and expenses as they happen. See balances, savings and spending trends across all your
            accounts, in ₹ and Indian time.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button size="lg" asChild>
              <Link href="/register">Create a free account</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5">
              <f.icon className="mb-3 size-5 text-savings" />
              <h2 className="font-medium">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
