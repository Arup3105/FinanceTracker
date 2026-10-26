import "server-only";
import { ObjectId } from "mongodb";
import type { z } from "zod";
import { balanceEffectExpression } from "@/lib/finance/ledger";
import type { AccountDTO } from "@/lib/finance/types";
import type { accountCreateSchema, accountUpdateSchema, adjustmentSchema } from "@/lib/validation/schemas";
import {
  accountsCollection,
  transactionsCollection,
  type FinancialAccountDoc,
  type TransactionDoc,
} from "@/server/db/collections";
import { badRequest, conflict, isDuplicateKeyError, notFound, staleVersion } from "@/server/errors";
import { nameKey } from "./expense-type-service";
import { getSettings } from "./settings-service";
import { resolveEffectiveAt, toSignedPaise } from "./shared";

interface LedgerTotals {
  effectPaise: number;
  count: number;
}

/** Sums the signed effect of every ledger entry per account (one aggregation for all accounts). */
async function ledgerTotalsByAccount(userId: string, accountIds?: ObjectId[]): Promise<Map<string, LedgerTotals>> {
  const match: Record<string, unknown> = { userId };
  if (accountIds) match.accountId = { $in: accountIds };
  const rows = await transactionsCollection()
    .aggregate<{ _id: ObjectId; effectPaise: number; count: number }>([
      { $match: match },
      { $group: { _id: "$accountId", effectPaise: { $sum: balanceEffectExpression }, count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((row) => [row._id.toHexString(), { effectPaise: row.effectPaise, count: row.count }]));
}

function toDTO(doc: FinancialAccountDoc, totals?: LedgerTotals): AccountDTO {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    type: doc.type,
    openingBalancePaise: doc.openingBalancePaise,
    balancePaise: doc.openingBalancePaise + (totals?.effectPaise ?? 0),
    currency: doc.currency,
    isArchived: doc.isArchived,
    hasTransactions: (totals?.count ?? 0) > 0,
    version: doc.version,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function listAccounts(userId: string, options: { includeArchived?: boolean } = {}): Promise<AccountDTO[]> {
  const filter = options.includeArchived ? { userId } : { userId, isArchived: false };
  const [docs, totals] = await Promise.all([
    accountsCollection().find(filter).sort({ isArchived: 1, createdAt: 1 }).toArray(),
    ledgerTotalsByAccount(userId),
  ]);
  return docs.map((doc) => toDTO(doc, totals.get(doc._id.toHexString())));
}

/** Loads an account only if it belongs to `userId`; otherwise reports "not found" (no ID probing). */
export async function getOwnedAccount(userId: string, id: ObjectId): Promise<FinancialAccountDoc> {
  const doc = await accountsCollection().findOne({ _id: id, userId });
  if (!doc) throw notFound("Account");
  return doc;
}

/** Like getOwnedAccount but also requires the account to accept new entries. */
export async function getActiveOwnedAccount(userId: string, id: ObjectId): Promise<FinancialAccountDoc> {
  const doc = await getOwnedAccount(userId, id);
  if (doc.isArchived) throw badRequest(`"${doc.name}" is archived. Restore it before adding entries.`);
  return doc;
}

export async function getAccount(userId: string, id: ObjectId): Promise<AccountDTO> {
  const doc = await getOwnedAccount(userId, id);
  const totals = await ledgerTotalsByAccount(userId, [id]);
  return toDTO(doc, totals.get(id.toHexString()));
}

export async function createAccount(userId: string, input: z.output<typeof accountCreateSchema>): Promise<AccountDTO> {
  const now = new Date();
  const doc: FinancialAccountDoc = {
    _id: new ObjectId(),
    userId,
    name: input.name,
    nameKey: nameKey(input.name),
    type: input.type,
    // The opening balance is money that existed before tracking started. It is
    // part of the balance but is never reported as income or savings.
    openingBalancePaise: toSignedPaise(input.openingBalance, "openingBalance"),
    currency: "INR",
    isArchived: false,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await accountsCollection().insertOne(doc);
  } catch (error) {
    if (isDuplicateKeyError(error)) throw conflict(`You already have an account named "${input.name}".`);
    throw error;
  }
  return toDTO(doc);
}

export async function updateAccount(
  userId: string,
  id: ObjectId,
  input: z.output<typeof accountUpdateSchema>,
): Promise<AccountDTO> {
  const existing = await getOwnedAccount(userId, id);
  if (existing.version !== input.version) throw staleVersion();

  const set: Partial<FinancialAccountDoc> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    set.name = input.name;
    set.nameKey = nameKey(input.name);
  }
  if (input.type !== undefined) set.type = input.type;
  if (input.isArchived !== undefined) set.isArchived = input.isArchived;

  if (input.openingBalance !== undefined) {
    const openingBalancePaise = toSignedPaise(input.openingBalance, "openingBalance");
    if (openingBalancePaise !== existing.openingBalancePaise) {
      // History must not be rewritten: once entries exist, corrections go through an audited adjustment.
      const hasEntries = await transactionsCollection().countDocuments({ userId, accountId: id }, { limit: 1 });
      if (hasEntries > 0) {
        throw conflict(
          "This account already has transactions, so its opening balance is locked. Use “Correct balance” to record an adjustment instead.",
        );
      }
      set.openingBalancePaise = openingBalancePaise;
    }
  }

  try {
    const updated = await accountsCollection().findOneAndUpdate(
      { _id: id, userId, version: input.version },
      { $set: set, $inc: { version: 1 } },
      { returnDocument: "after" },
    );
    if (!updated) throw staleVersion();
    return getAccount(userId, updated._id);
  } catch (error) {
    if (isDuplicateKeyError(error)) throw conflict(`You already have an account named "${input.name}".`);
    throw error;
  }
}

/** Accounts with history cannot be deleted (that would destroy records); they must be archived. */
export async function deleteAccount(userId: string, id: ObjectId): Promise<void> {
  await getOwnedAccount(userId, id);
  const hasEntries = await transactionsCollection().countDocuments(
    { userId, $or: [{ accountId: id }, { counterpartyAccountId: id }] },
    { limit: 1 },
  );
  if (hasEntries > 0) throw conflict("This account has transactions. Archive it instead to keep your history.");
  await accountsCollection().deleteOne({ _id: id, userId });
}

/**
 * Records a dated, reasoned balance adjustment that moves the account's current
 * balance to `targetBalance`. The opening balance and existing entries are untouched.
 */
export async function createAdjustment(
  userId: string,
  accountId: ObjectId,
  input: z.output<typeof adjustmentSchema>,
): Promise<{ adjustmentId: string | null; account: AccountDTO }> {
  const account = await getActiveOwnedAccount(userId, accountId);
  const { timezone } = await getSettings(userId);
  const effectiveAt = resolveEffectiveAt(input.effectiveAt, timezone);
  const targetPaise = toSignedPaise(input.targetBalance, "targetBalance");

  const existing = await transactionsCollection().findOne({ userId, idempotencyKey: input.idempotencyKey });
  if (existing) return { adjustmentId: existing._id.toHexString(), account: await getAccount(userId, accountId) };

  const current = await getAccount(userId, accountId);
  const delta = targetPaise - current.balancePaise;
  if (delta === 0) throw badRequest("The balance already matches that amount.");

  const now = new Date();
  const doc: TransactionDoc = {
    _id: new ObjectId(),
    userId,
    accountId: account._id,
    type: "adjustment",
    amountPaise: Math.abs(delta),
    adjustmentDirection: delta > 0 ? "increase" : "decrease",
    adjustmentReason: input.reason,
    name: "Balance adjustment",
    effectiveAt,
    createdAt: now,
    updatedAt: now,
    idempotencyKey: input.idempotencyKey,
    version: 0,
  };
  try {
    await transactionsCollection().insertOne(doc);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  return { adjustmentId: doc._id.toHexString(), account: await getAccount(userId, accountId) };
}
