import { z } from "zod";
import {
  ACCOUNT_TYPES,
  CASH_WITHDRAWAL_MODES,
  PERIODS,
  SUPPORTED_CURRENCIES,
} from "@/lib/finance/constants";
import { parseRupeesToPaise, parseSignedRupeesToPaise } from "@/lib/money";
import { isValidTimeZone } from "@/lib/dates";

/**
 * Schemas shared by client forms and server route handlers. Amounts travel as
 * rupee strings ("150.50") and are converted to integer paise on the server.
 * Date-times travel as wall-clock strings ("2026-10-25T14:30") interpreted in
 * the user's configured timezone.
 */

export const objectIdString = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id.");

export const amountString = z
  .string()
  .trim()
  .min(1, "Enter an amount.")
  .refine((value) => {
    const paise = parseRupeesToPaise(value);
    return paise !== null && paise > 0;
  }, "Enter an amount greater than zero with at most 2 decimal places.");

export const signedAmountString = z
  .string()
  .trim()
  .min(1, "Enter an amount (0 is allowed).")
  .refine((value) => parseSignedRupeesToPaise(value) !== null, "Enter a valid amount with at most 2 decimal places.");

export const localDateTimeString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time.");

export const localDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .transform((value) => (value ? value : undefined));

const name = (label: string, max = 100) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);

export const idempotencyKey = z.uuid("Invalid submission key.");

const version = z.number().int().nonnegative();

// ---------- accounts ----------

export const accountCreateSchema = z.object({
  name: name("Account name", 60),
  type: z.enum(ACCOUNT_TYPES, "Choose an account type."),
  openingBalance: signedAmountString,
});
export type AccountCreateInput = z.input<typeof accountCreateSchema>;

export const accountUpdateSchema = z.object({
  name: name("Account name", 60).optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  openingBalance: signedAmountString.optional(),
  isArchived: z.boolean().optional(),
  version,
});
export type AccountUpdateInput = z.input<typeof accountUpdateSchema>;

export const adjustmentSchema = z.object({
  targetBalance: signedAmountString,
  reason: z.string().trim().min(3, "Explain why the balance is being corrected.").max(200),
  effectiveAt: localDateTimeString,
  idempotencyKey,
});
export type AdjustmentInput = z.input<typeof adjustmentSchema>;

// ---------- income & expenses ----------

export const expenseSchema = z.object({
  name: name("Expense name"),
  categoryId: objectIdString,
  amount: amountString,
  accountId: objectIdString,
  effectiveAt: localDateTimeString,
  comment: optionalText(500),
  reference: optionalText(100),
});
export const expenseCreateSchema = expenseSchema.extend({ idempotencyKey });
export const expenseUpdateSchema = expenseSchema.extend({ version });
export type ExpenseInput = z.input<typeof expenseSchema>;

export const incomeSchema = z.object({
  name: name("Income name"),
  amount: amountString,
  accountId: objectIdString,
  effectiveAt: localDateTimeString,
  comment: optionalText(500),
});
export const incomeCreateSchema = incomeSchema.extend({ idempotencyKey });
export const incomeUpdateSchema = incomeSchema.extend({ version });
export type IncomeInput = z.input<typeof incomeSchema>;

export const refundSchema = z.object({
  amount: amountString,
  refundedAt: localDateTimeString,
  note: optionalText(200),
  version,
});
export type RefundInput = z.input<typeof refundSchema>;

// ---------- transfers ----------

export const transferSchema = z
  .object({
    fromAccountId: objectIdString,
    toAccountId: objectIdString,
    amount: amountString,
    effectiveAt: localDateTimeString,
    comment: optionalText(500),
  })
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    message: "Choose two different accounts.",
    path: ["toAccountId"],
  });
export const transferCreateSchema = transferSchema.and(z.object({ idempotencyKey }));
export const transferUpdateSchema = transferSchema.and(z.object({ version }));
export type TransferInput = z.input<typeof transferSchema>;

export const cashWithdrawalSchema = z.object({
  accountId: objectIdString,
  cashAccountId: objectIdString.optional(),
  amount: amountString,
  effectiveAt: localDateTimeString,
  comment: optionalText(500),
  idempotencyKey,
});
export type CashWithdrawalInput = z.input<typeof cashWithdrawalSchema>;

// ---------- expense types & settings ----------

export const expenseTypeSchema = z.object({
  name: name("Expense type", 40),
});

export const expenseTypeUpdateSchema = z.object({
  name: name("Expense type", 40).optional(),
  isArchived: z.boolean().optional(),
});

export const settingsSchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
  timezone: z.string().refine(isValidTimeZone, "Choose a valid timezone."),
  cashWithdrawalMode: z.enum(CASH_WITHDRAWAL_MODES),
});
export type SettingsInput = z.input<typeof settingsSchema>;

export const deleteDataSchema = z.object({
  confirm: z.literal("DELETE", "Type DELETE to confirm."),
});

// ---------- queries ----------

export const SORTS = ["date_desc", "date_asc", "amount_desc", "amount_asc"] as const;
export type Sort = (typeof SORTS)[number];

export const transactionListQuerySchema = z.object({
  kind: z.enum(["income", "expense", "transfer", "all"]).catch("all"),
  q: z.string().trim().max(100).optional().catch(undefined),
  accountId: objectIdString.optional().catch(undefined),
  categoryId: objectIdString.optional().catch(undefined),
  from: localDateString.optional().catch(undefined),
  to: localDateString.optional().catch(undefined),
  sort: z.enum(SORTS).catch("date_desc"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

export const periodQuerySchema = z.object({
  period: z.enum(PERIODS).catch("month"),
  from: localDateString.optional().catch(undefined),
  to: localDateString.optional().catch(undefined),
});
export type PeriodQuery = z.infer<typeof periodQuerySchema>;
