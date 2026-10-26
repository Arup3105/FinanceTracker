"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIOD_LABELS, PERIODS, type Period } from "@/lib/finance/constants";

/** Reporting-period picker. State lives in the URL (?period=&from=&to=) so pages stay server-rendered and shareable. */
export function PeriodSelector({ period, from, to, label }: { period: Period; from?: string; to?: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [customFrom, setCustomFrom] = useState(from ?? "");
  const [customTo, setCustomTo] = useState(to ?? "");

  function navigate(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-end gap-2" aria-busy={pending}>
      <div className="space-y-1">
        <Select
          value={period}
          onValueChange={(value) => {
            if (value === "custom") navigate({ period: "custom", from: customFrom || undefined, to: customTo || undefined });
            else navigate({ period: value, from: undefined, to: undefined });
          }}
        >
          <SelectTrigger className="w-40" aria-label="Reporting period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p} value={p}>
                {PERIOD_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {period === "custom" && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ period: "custom", from: customFrom, to: customTo });
          }}
        >
          <Input
            type="date"
            aria-label="From date"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="w-40"
            required
          />
          <Input
            type="date"
            aria-label="To date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => setCustomTo(e.target.value)}
            className="w-40"
            required
          />
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>
      )}
      <span className="pb-1.5 text-sm text-muted-foreground">{pending ? "Loading…" : label}</span>
    </div>
  );
}
