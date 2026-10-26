import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

type Tone = "auto" | "income" | "expense" | "neutral";

/**
 * Displays integer paise as INR. "auto" colors negative values red and
 * positive values green; text uses AA-contrast tones, never chart colors.
 */
export function Money({
  paise,
  tone = "neutral",
  signed = false,
  className,
}: {
  paise: number;
  tone?: Tone;
  signed?: boolean;
  className?: string;
}) {
  const toneClass =
    tone === "income"
      ? "text-positive"
      : tone === "expense"
        ? "text-negative"
        : tone === "auto"
          ? paise < 0
            ? "text-negative"
            : paise > 0
              ? "text-positive"
              : ""
          : "";
  return <span className={cn("tabular-nums", toneClass, className)}>{formatINR(paise, { signed })}</span>;
}
