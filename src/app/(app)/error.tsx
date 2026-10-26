"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Friendly error state for the authenticated area. Never shows stack traces or raw errors. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page error", error.digest ?? "");
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-10 text-center">
      <AlertTriangle className="size-8 text-negative" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">We couldn’t load this page</h2>
        <p className="text-sm text-muted-foreground">
          This is usually temporary (for example, the database is waking up). Please try again.
        </p>
        {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>}
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
