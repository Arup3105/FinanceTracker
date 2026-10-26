"use client";

import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { AccountDTO, BreakdownItem, PeriodSummary, SeriesPoint } from "@/lib/finance/types";
import { formatINR, formatINRCompact } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Charts read real report data in integer paise. Colors come from the validated
 * finance tokens (income = aqua, expense = orange, savings/balance = blue);
 * every chart has a legend or title naming its series, plus INR tooltips.
 */

type TooltipEntry = { name?: string | number; value?: number | string | null; color?: string; dataKey?: string | number };

function MoneyTooltip({
  active,
  payload,
  label,
  config,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  config: ChartConfig;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="grid min-w-40 gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <p className="font-medium">{label}</p>
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.name);
        if (item.value === null || item.value === undefined) return null;
        return (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 rounded-[2px]" style={{ background: item.color ?? `var(--color-${key})` }} />
              {config[key]?.label ?? key}
            </span>
            <span className="font-medium tabular-nums text-foreground">{formatINR(Number(item.value))}</span>
          </div>
        );
      })}
    </div>
  );
}

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--chart-muted)", fontSize: 11 },
} as const;

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

const incomeExpenseConfig = {
  incomePaise: { label: "Income", color: "var(--income)" },
  expensePaise: { label: "Expenses", color: "var(--expense)" },
} satisfies ChartConfig;

/** Income vs expenses per day / week / month of the selected period. */
export function IncomeExpenseChart({ series }: { series: SeriesPoint[] }) {
  if (!series.some((p) => p.incomePaise || p.expensePaise)) {
    return <ChartEmpty message="No income or expenses in this period yet." />;
  }
  return (
    <ChartContainer config={incomeExpenseConfig} className="h-64 w-full">
      <BarChart data={series} barGap={2} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => formatINRCompact(v)} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<MoneyTooltip config={incomeExpenseConfig} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="incomePaise" fill="var(--color-incomePaise)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expensePaise" fill="var(--color-expensePaise)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  );
}

const netConfig = { netPaise: { label: "Net savings", color: "var(--savings)" } } satisfies ChartConfig;

/** Net savings (income − expenses) per bucket; negative bars use the expense color. */
export function NetSavingsChart({ series }: { series: SeriesPoint[] }) {
  if (!series.some((p) => p.netPaise)) return <ChartEmpty message="No savings activity in this period yet." />;
  return (
    <ChartContainer config={netConfig} className="h-64 w-full">
      <BarChart data={series} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => formatINRCompact(v)} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<MoneyTooltip config={netConfig} />} />
        <Bar dataKey="netPaise" radius={4} maxBarSize={28}>
          {series.map((point) => (
            <Cell key={point.start} fill={point.netPaise < 0 ? "var(--expense)" : "var(--savings)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

const balanceConfig = { balancePaise: { label: "Combined balance", color: "var(--savings)" } } satisfies ChartConfig;

/** Combined balance across all accounts at the end of each bucket (opening balances included). */
export function BalanceTrendChart({ series }: { series: SeriesPoint[] }) {
  const points = series.filter((p) => p.balancePaise !== null);
  if (points.length === 0) return <ChartEmpty message="No balance history yet." />;
  return (
    <ChartContainer config={balanceConfig} className="h-64 w-full">
      <AreaChart data={series} margin={{ left: 4, right: 4 }}>
        <defs>
          <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--savings)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--savings)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => formatINRCompact(v)} domain={["auto", "auto"]} />
        <ChartTooltip cursor={{ stroke: "var(--chart-muted)" }} content={<MoneyTooltip config={balanceConfig} />} />
        <Area
          dataKey="balancePaise"
          type="monotone"
          stroke="var(--color-balancePaise)"
          strokeWidth={2}
          fill="url(#balanceFill)"
          connectNulls={false}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}

const comparisonConfig = {
  current: { label: "This period", color: "var(--savings)" },
  previous: { label: "Previous period", color: "var(--chart-muted)" },
} satisfies ChartConfig;

/** Income / expenses / net savings compared with the previous equivalent period. */
export function PeriodComparisonChart({ current, previous }: { current: PeriodSummary; previous: PeriodSummary }) {
  const data = [
    { label: "Income", current: current.incomePaise, previous: previous.incomePaise },
    { label: "Expenses", current: current.expensePaise, previous: previous.expensePaise },
    { label: "Net savings", current: current.netSavingsPaise, previous: previous.netSavingsPaise },
  ];
  if (data.every((d) => !d.current && !d.previous)) return <ChartEmpty message="Nothing to compare yet." />;
  return (
    <ChartContainer config={comparisonConfig} className="h-64 w-full">
      <BarChart data={data} barGap={2} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => formatINRCompact(v)} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<MoneyTooltip config={comparisonConfig} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="current" fill="var(--color-current)" radius={4} maxBarSize={40} />
        <Bar dataKey="previous" fill="var(--color-previous)" radius={4} maxBarSize={40} />
      </BarChart>
    </ChartContainer>
  );
}

/**
 * Ranked horizontal bars with direct labels (HTML, so every value is readable
 * without hover). Used for expense-by-type and income-by-source breakdowns.
 * Rows with an `href` link to the matching transactions; the server page builds
 * it, because functions can't be passed from Server to Client Components.
 */
export function BreakdownList({
  items,
  tone,
  emptyMessage,
  limit = 8,
}: {
  items: (BreakdownItem & { href?: string })[];
  tone: "income" | "expense";
  emptyMessage: string;
  limit?: number;
}) {
  if (items.length === 0) return <ChartEmpty message={emptyMessage} />;
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const rows: (BreakdownItem & { href?: string })[] = rest.length
    ? [...shown, { key: "other", label: `Other (${rest.length})`, amountPaise: rest.reduce((s, i) => s + i.amountPaise, 0), count: rest.reduce((s, i) => s + i.count, 0) }]
    : shown;
  const total = items.reduce((sum, item) => sum + item.amountPaise, 0);
  const max = Math.max(...rows.map((r) => r.amountPaise));

  return (
    <ul className="space-y-3">
      {rows.map((item) => {
        const share = total > 0 ? Math.round((item.amountPaise / total) * 100) : 0;
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{item.label}</span>
              <span className="shrink-0 tabular-nums">
                {formatINR(item.amountPaise)} <span className="text-xs text-muted-foreground">· {share}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted">
              <div
                className={cn("h-2 rounded-full", tone === "income" ? "bg-income" : "bg-expense")}
                style={{ width: `${Math.max(2, (item.amountPaise / max) * 100)}%` }}
              />
            </div>
          </>
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className="block rounded-md p-1 -m-1 hover:bg-muted/60">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Account balance comparison (handles negative balances such as credit cards). */
export function AccountBalanceList({ accounts }: { accounts: AccountDTO[] }) {
  const active = accounts.filter((a) => !a.isArchived);
  if (active.length === 0) return <ChartEmpty message="Add an account to see balances here." />;
  const max = Math.max(...active.map((a) => Math.abs(a.balancePaise)), 1);
  return (
    <ul className="space-y-3">
      {active.map((account) => (
        <li key={account.id}>
          <Link href={`/accounts#${account.id}`} className="-m-1 block rounded-md p-1 hover:bg-muted/60">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{account.name}</span>
              <span className={cn("shrink-0 tabular-nums", account.balancePaise < 0 && "text-negative")}>
                {formatINR(account.balancePaise)}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted">
              <div
                className={cn("h-2 rounded-full", account.balancePaise < 0 ? "bg-expense" : "bg-savings")}
                style={{ width: `${Math.max(2, (Math.abs(account.balancePaise) / max) * 100)}%` }}
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
