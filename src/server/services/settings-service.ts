import "server-only";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "@/lib/finance/constants";
import type { SettingsDTO } from "@/lib/finance/types";
import type { settingsSchema } from "@/lib/validation/schemas";
import type { z } from "zod";
import { settingsCollection } from "@/server/db/collections";

export const DEFAULT_SETTINGS: SettingsDTO = {
  currency: DEFAULT_CURRENCY,
  timezone: DEFAULT_TIMEZONE,
  cashWithdrawalMode: "expense",
};

/** Returns stored settings, or defaults when the user has never saved any (no write needed). */
export async function getSettings(userId: string): Promise<SettingsDTO> {
  const doc = await settingsCollection().findOne({ _id: userId });
  if (!doc) return DEFAULT_SETTINGS;
  return { currency: doc.currency, timezone: doc.timezone, cashWithdrawalMode: doc.cashWithdrawalMode };
}

export async function updateSettings(userId: string, input: z.output<typeof settingsSchema>): Promise<SettingsDTO> {
  const now = new Date();
  await settingsCollection().updateOne(
    { _id: userId },
    {
      $set: { ...input, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  return getSettings(userId);
}
