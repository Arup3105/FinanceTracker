import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Headline figure with an optional comparison to the previous period.
 * `goodWhenUp` decides whether an increase is shown as positive (income) or negative (expenses).
 */
export function StatCard({
  title,
  paise,
  icon: Icon,
  accent,
  hint,
  previousPaise,
  goodWhenUp = true,
  href,
  valueTone = "neutral",
}: {
  title: string;
  paise: number;
  icon: LucideIcon;
  accent: "income" | "expense" | "savings" | "neutral";
  hint?: React.ReactNode;
  previousPaise?: number;
  goodWhenUp?: boolean;
  href?: string;
  valueTone?: "neutral" | "auto";
}) {
  const delta = previousPaise === undefined ? null : paise - previousPaise;
  const deltaGood = delta !== null && (goodWhenUp ? delta >= 0 : delta <= 0);
  const body = (
    <Card className={cn("h-full", href && "transition-colors hover:bg-muted/40")}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg",
            accent === "income" && "bg-income/15 text-income",
            accent === "expense" && "bg-expense/15 text-expense",
            accent === "savings" && "bg-savings/15 text-savings",
            accent === "neutral" && "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent className="space-y-1">
        <p
          className={cn(
            "text-2xl font-semibold tabular-nums tracking-tight",
            valueTone === "auto" && paise < 0 && "text-negative",
          )}
        >
          {formatINR(paise)}
        </p>
        {delta !== null && delta !== 0 && (
          <p className={cn("flex items-center gap-1 text-xs", deltaGood ? "text-positive" : "text-negative")}>
            {delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {formatINR(Math.abs(delta))} {delta > 0 ? "more" : "less"} than previous period
          </p>
        )}
        {delta === 0 && <p className="text-xs text-muted-foreground">Same as previous period</p>}
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
      {body}
    </Link>
  ) : (
    body
  );
}
