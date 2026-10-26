import "server-only";
import { ObjectId, type ClientSession, type Filter, type Sort } from "mongodb";
import type { z } from "zod";
import { CASH_WITHDRAWAL_CATEGORY, PAGE_SIZE } from "@/lib/finance/constants";
import { netExpensePaise, reportableAmountExpression } from "@/lib/finance/ledger";
import { parseLocalDate } from "@/lib/dates";
import type { Paginated, TransactionDTO } from "@/lib/finance/types";
import type {
  cashWithdrawalSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  incomeCreateSchema,
  incomeUpdateSchema,
  refundSchema,
  TransactionListQuery,
  transferCreateSchema,
  transferUpdateSchema,
} from "@/lib/validation/schemas";
import { getMongoClient } from "@/server/db/client";
import {
  accountsCollection,
  expenseTypesCollection,
  transactionsCollection,
  type TransactionDoc,
} from "@/server/db/collections";
import { badRequest, conflict, isDuplicateKeyError, notFound, staleVersion } from "@/server/errors";
import { getActiveOwnedAccount, getOwnedAccount } from "./account-service";
import { createExpenseType, findExpenseTypeByName, getOwnedExpenseType } from "./expense-type-service";
import { getSettings } from "./settings-service";
import { escapeRegex, resolveEffectiveAt, toPaise } from "./shared";

// ---------------------------------------------------------------- helpers

export interface Lookups {
  accounts: Map<string, string>;
  categories: Map<string, string>;
}

export async function loadLookups(userId: string): Promise<Lookups> {
  const [accounts, categories] = await Promise.all([
    accountsCollection().find({ userId }, { projection: { name: 1 } }).toArray(),
    expenseTypesCollection().find({ userId }, { projection: { name: 1 } }).toArray(),
  ]);
  return {
    accounts: new Map(accounts.map((a) => [a._id.toHexString(), a.name])),
    categories: new Map(categories.map((c) => [c._id.toHexString(), c.name])),
  };
}

export function toTransactionDTO(doc: TransactionDoc, lookups: Lookups): TransactionDTO {
  const accountId = doc.accountId.toHexString();
  const categoryId = doc.categoryId?.toHexString();
  const counterpartyAccountId = doc.counterpartyAccountId?.toHexString();
  return {
    id: doc._id.toHexString(),
    type: doc.type,
    name: doc.name,
    amountPaise: doc.amountPaise,
    netAmountPaise: doc.type === "expense" ? netExpensePaise(doc) : doc.amountPaise,
    refundedPaise: doc.refundedPaise ?? 0,
    refunds: (doc.refunds ?? []).map((r) => ({
      id: r._id.toHexString(),
      amountPaise: r.amountPaise,
      refundedAt: r.refundedAt.toISOString(),
      note: r.note,
    })),
    accountId,
    accountName: lookups.accounts.get(accountId) ?? "Unknown account",
    categoryId,
    categoryName: categoryId ? (lookups.categories.get(categoryId) ?? "Uncategorised") : undefined,
    effectiveAt: doc.effectiveAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    comment: doc.comment,
    reference: doc.reference,
    transferGroupId: doc.transferGroupId?.toHexString(),
    counterpartyAccountId,
    counterpartyAccountName: counterpartyAccountId ? lookups.accounts.get(counterpartyAccountId) : undefined,
    isCashWithdrawal: doc.isCashWithdrawal ?? false,
    adjustmentDirection: doc.adjustmentDirection,
    adjustmentReason: doc.adjustmentReason,
    version: doc.version,
  };
}

async function toDTOs(userId: string, docs: TransactionDoc[]): Promise<TransactionDTO[]> {
  if (docs.length === 0) return [];
  const lookups = await loadLookups(userId);
  return docs.map((doc) => toTransactionDTO(doc, lookups));
}

async function toDTO(userId: string, doc: TransactionDoc): Promise<TransactionDTO> {
  return (await toDTOs(userId, [doc]))[0];
}

/** Runs `fn` inside a MongoDB multi-document transaction (supported on Atlas replica sets, including M0). */
async function inTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = getMongoClient().startSession();
  try {
    return await session.withTransaction(fn);
  } finally {
    await session.endSession();
  }
}

export interface CreateResult {
  transaction: TransactionDTO;
  /** True when the idempotency key matched an earlier submission and nothing new was written. */
  duplicate: boolean;
}

/** Inserts an entry; if the same idempotency key was already used, returns the original instead. */
async function insertIdempotent(userId: string, doc: TransactionDoc): Promise<CreateResult> {
  try {
    await transactionsCollection().insertOne(doc);
    return { transaction: await toDTO(userId, doc), duplicate: false };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await transactionsCollection().findOne({ userId, idempotencyKey: doc.idempotencyKey });
    if (!existing) throw error;
    return { transaction: await toDTO(userId, existing), duplicate: true };
  }
}

export async function getOwnedTransaction(userId: string, id: ObjectId): Promise<TransactionDoc> {
  const doc = await transactionsCollection().findOne({ _id: id, userId });
  if (!doc) throw notFound("Transaction");
  return doc;
}

export async function getTransaction(userId: string, id: ObjectId): Promise<TransactionDTO> {
  return toDTO(userId, await getOwnedTransaction(userId, id));
}

/** New entries need an active account; edits may keep an entry on its (possibly archived) current account. */
async function resolveAccount(userId: string, accountId: string, currentAccountId?: ObjectId) {
  const id = new ObjectId(accountId);
  if (currentAccountId?.equals(id)) return getOwnedAccount(userId, id);
  return getActiveOwnedAccount(userId, id);
}

async function resolveCategory(userId: string, categoryId: string, currentCategoryId?: ObjectId) {
  const id = new ObjectId(categoryId);
  const category = await getOwnedExpenseType(userId, id);
  if (category.isArchived && !currentCategoryId?.equals(id)) {
    throw badRequest(`The expense type "${category.name}" is archived.`, { categoryId: ["Choose an active expense type."] });
  }
  return category;
}

// ---------------------------------------------------------------- income & expenses

export async function createIncome(userId: string, input: z.output<typeof incomeCreateSchema>): Promise<CreateResult> {
  const account = await resolveAccount(userId, input.accountId);
  const { timezone } = await getSettings(userId);
  const now = new Date();
  return insertIdempotent(userId, {
    _id: new ObjectId(),
    userId,
    accountId: account._id,
    type: "income",
    amountPaise: toPaise(input.amount),
    name: input.name,
    effectiveAt: resolveEffectiveAt(input.effectiveAt, timezone),
    comment: input.comment,
    createdAt: now,
    updatedAt: now,
    idempotencyKey: input.idempotencyKey,
    version: 0,
  });
}

export async function createExpense(userId: string, input: z.output<typeof expenseCreateSchema>): Promise<CreateResult> {
  const [account, category, { timezone }] = await Promise.all([
    resolveAccount(userId, input.accountId),
    resolveCategory(userId, input.categoryId),
    getSettings(userId),
  ]);
  const now = new Date();
  return insertIdempotent(userId, {
    _id: new ObjectId(),
    userId,
    accountId: account._id,
    type: "expense",
    amountPaise: toPaise(input.amount),
    refundedPaise: 0,
    refunds: [],
    name: input.name,
    categoryId: category._id,
    effectiveAt: resolveEffectiveAt(input.effectiveAt, timezone),
    comment: input.comment,
    reference: input.reference,
    createdAt: now,
    updatedAt: now,
    idempotencyKey: input.idempotencyKey,
    version: 0,
  });
}

export async function updateIncome(
  userId: string,
  id: ObjectId,
  input: z.output<typeof incomeUpdateSchema>,
): Promise<TransactionDTO> {
  const existing = await getOwnedTransaction(userId, id);
  if (existing.type !== "income") throw notFound("Income");
  const account = await resolveAccount(userId, input.accountId, existing.accountId);
  const { timezone } = await getSettings(userId);
  return applyUpdate(userId, existing, input.version, {
    accountId: account._id,
    amountPaise: toPaise(input.amount),
    name: input.name,
    effectiveAt: resolveEffectiveAt(input.effectiveAt, timezone),
    comment: input.comment,
  });
}

export async function updateExpense(
  userId: string,
  id: ObjectId,
  input: z.output<typeof expenseUpdateSchema>,
): Promise<TransactionDTO> {
  const existing = await getOwnedTransaction(userId, id);
  if (existing.type !== "expense") throw notFound("Expense");
  const [account, category, { timezone }] = await Promise.all([
    resolveAccount(userId, input.accountId, existing.accountId),
    resolveCategory(userId, input.categoryId, existing.categoryId),
    getSettings(userId),
  ]);
  const amountPaise = toPaise(input.amount);
  if (amountPaise < (existing.refundedPaise ?? 0)) {
    throw badRequest("The amount cannot be less than the amount already refunded.", {
      amount: ["Must be at least the refunded amount."],
    });
  }
  return applyUpdate(userId, existing, input.version, {
    accountId: account._id,
    amountPaise,
    name: input.name,
    categoryId: category._id,
    effectiveAt: resolveEffectiveAt(input.effectiveAt, timezone),
    comment: input.comment,
    reference: input.reference,
  });
}

/** Updates in place (no new document) guarded by the optimistic-concurrency version. */
async function applyUpdate(
  userId: string,
  existing: TransactionDoc,
  version: number,
  fields: Partial<TransactionDoc>,
): Promise<TransactionDTO> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  const unset: Record<string, ""> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) unset[key] = "";
    else set[key] = value;
  }
  const updated = await transactionsCollection().findOneAndUpdate(
    { _id: existing._id, userId, version },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}), $inc: { version: 1 } },
    { returnDocument: "after" },
  );
  if (!updated) throw staleVersion();
  return toDTO(userId, updated);
}

/**
 * Deletes an income or expense entry. Transfer legs are always removed as a pair;
 * balance adjustments are an audit trail and cannot be deleted.
 */
export async function deleteTransaction(userId: string, id: ObjectId): Promise<void> {
  const existing = await getOwnedTransaction(userId, id);
  if (existing.type === "adjustment") {
    throw conflict("Balance adjustments are kept as an audit trail. Record a new adjustment to correct the balance.");
  }
  if (existing.transferGroupId) {
    await deleteTransfer(userId, existing.transferGroupId);
    return;
  }
  await transactionsCollection().deleteOne({ _id: id, userId });
}

// ---------------------------------------------------------------- refunds

/**
 * Refunds reduce the original expense: net expense = amount − refunded. The
 * refund is never reported as income, so it cannot be counted twice.
 */
export async function addRefund(
  userId: string,
  expenseId: ObjectId,
  input: z.output<typeof refundSchema>,
): Promise<TransactionDTO> {
  const existing = await getOwnedTransaction(userId, expenseId);
  if (existing.type !== "expense") throw badRequest("Only expenses can be refunded.");
  const { timezone } = await getSettings(userId);
  const amountPaise = toPaise(input.amount);
  const refundedAt = resolveEffectiveAt(input.refundedAt, timezone, "refundedAt");
  const remaining = existing.amountPaise - (existing.refundedPaise ?? 0);
  if (amountPaise > remaining) {
    throw badRequest("The refund cannot exceed the remaining expense amount.", {
      amount: [`At most ${(remaining / 100).toFixed(2)} can still be refunded.`],
    });
  }
  const updated = await transactionsCollection().findOneAndUpdate(
    {
      _id: expenseId,
      userId,
      type: "expense",
      version: input.version,
      // Re-checked atomically so concurrent refunds can never exceed the original amount.
      $expr: { $lte: [{ $add: [{ $ifNull: ["$refundedPaise", 0] }, amountPaise] }, "$amountPaise"] },
    },
    {
      $inc: { refundedPaise: amountPaise, version: 1 },
      $push: { refunds: { _id: new ObjectId(), amountPaise, refundedAt, note: input.note, createdAt: new Date() } },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" },
  );
  if (!updated) throw staleVersion();
  return toDTO(userId, updated);
}

export async function removeRefund(
  userId: string,
  expenseId: ObjectId,
  refundId: ObjectId,
  version: number,
): Promise<TransactionDTO> {
  const existing = await getOwnedTransaction(userId, expenseId);
  const refund = existing.refunds?.find((r) => r._id.equals(refundId));
  if (existing.type !== "expense" || !refund) throw notFound("Refund");
  const updated = await transactionsCollection().findOneAndUpdate(
    { _id: expenseId, userId, version, "refunds._id": refundId },
    {
      $inc: { refundedPaise: -refund.amountPaise, version: 1 },
      $pull: { refunds: { _id: refundId } },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" },
  );
  if (!updated) throw staleVersion();
  return toDTO(userId, updated);
}

// ---------------------------------------------------------------- transfers

interface TransferLegs {
  out: TransactionDoc;
  in: TransactionDoc;
}

function buildTransferLegs(
  userId: string,
  fields: {
    groupId: ObjectId;
    from: ObjectId;
    to: ObjectId;
    amountPaise: number;
    effectiveAt: Date;
    comment?: string;
    name: string;
    isCashWithdrawal?: boolean;
    idempotencyKey?: string;
  },
): TransferLegs {
  const now = new Date();
  const base = {
    userId,
    amountPaise: fields.amountPaise,
    name: fields.name,
    effectiveAt: fields.effectiveAt,
    comment: fields.comment,
    transferGroupId: fields.groupId,
    isCashWithdrawal: fields.isCashWithdrawal || undefined,
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
  return {
    // Only the outgoing leg carries the idempotency key (the unique index allows one per key).
    out: {
      ...base,
      _id: new ObjectId(),
      type: "transfer_out",
      accountId: fields.from,
      counterpartyAccountId: fields.to,
      idempotencyKey: fields.idempotencyKey,
    },
    in: { ...base, _id: new ObjectId(), type: "transfer_in", accountId: fields.to, counterpartyAccountId: fields.from },
  };
}

/** Inserts both legs atomically: either both exist or neither does. */
async function insertTransfer(userId: string, legs: TransferLegs): Promise<CreateResult> {
  try {
    await inTransaction(async (session) => {
      await transactionsCollection().insertMany([legs.out, legs.in], { session });
    });
    return { transaction: await toDTO(userId, legs.out), duplicate: false };
  } catch (error) {
    if (!isDuplicateKeyError(error) || !legs.out.idempotencyKey) throw error;
    const existing = await transactionsCollection().findOne({ userId, idempotencyKey: legs.out.idempotencyKey });
    if (!existing) throw error;
    return { transaction: await toDTO(userId, existing), duplicate: true };
  }
}

export async function createTransfer(
  userId: string,
  input: z.output<typeof transferCreateSchema>,
): Promise<CreateResult> {
  const [from, to, { timezone }] = await Promise.all([
    getActiveOwnedAccount(userId, new ObjectId(input.fromAccountId)),
    getActiveOwnedAccount(userId, new ObjectId(input.toAccountId)),
    getSettings(userId),
  ]);
  if (from._id.equals(to._id)) throw badRequest("Choose two different accounts.");
  const legs = buildTransferLegs(userId, {
    groupId: new ObjectId(),
    from: from._id,
    to: to._id,
    amountPaise: toPaise(input.amount),
    effectiveAt: resolveEffectiveAt(input.effectiveAt, timezone),
    comment: input.comment,
    name: "Transfer",
    idempotencyKey: input.idempotencyKey,
  });
  return insertTransfer(userId, legs);
}

async function getTransferLegs(userId: string, groupId: ObjectId): Promise<TransferLegs> {
  const legs = await transactionsCollection().find({ userId, transferGroupId: groupId }).toArray();
  const out = legs.find((leg) => leg.type === "transfer_out");
  const incoming = legs.find((leg) => leg.type === "transfer_in");
  if (!out || !incoming) throw notFound("Transfer");
  return { out, in: incoming };
}

export async function getTransfer(userId: string, groupId: ObjectId): Promise<TransactionDTO> {
  const legs = await getTransferLegs(userId, groupId);
  return toDTO(userId, legs.out);
}

export async function updateTransfer(
  userId: string,
  groupId: ObjectId,
  input: z.output<typeof transferUpdateSchema>,
): Promise<TransactionDTO> {
  const legs = await getTransferLegs(userId, groupId);
  if (legs.out.version !== input.version) throw staleVersion();
  const [from, to, { timezone }] = await Promise.all([
    resolveAccount(userId, input.fromAccountId, legs.out.accountId),
    resolveAccount(userId, input.toAccountId, legs.in.accountId),
    getSettings(userId),
  ]);
  if (from._id.equals(to._id)) throw badRequest("Choose two different accounts.");
  const common = {
    amountPaise: toPaise(input.amount),
    effectiveAt: resolveEffectiveAt(input.effectiveAt, timezone),
    updatedAt: new Date(),
  };
  const commentUpdate = input.comment ? { $set: { comment: input.comment } } : { $unset: { comment: "" as const } };

  await inTransaction(async (session) => {
    const outResult = await transactionsCollection().updateOne(
      { _id: legs.out._id, userId, version: input.version },
      { $set: { ...common, accountId: from._id, counterpartyAccountId: to._id }, $inc: { version: 1 } },
      { session },
    );
    const inResult = await transactionsCollection().updateOne(
      { _id: legs.in._id, userId, version: legs.in.version },
      { $set: { ...common, accountId: to._id, counterpartyAccountId: from._id }, $inc: { version: 1 } },
      { session },
    );
    if (outResult.matchedCount !== 1 || inResult.matchedCount !== 1) throw staleVersion();
    await transactionsCollection().updateMany({ userId, transferGroupId: groupId }, commentUpdate, { session });
  });
  return getTransfer(userId, groupId);
}

export async function deleteTransfer(userId: string, groupId: ObjectId): Promise<void> {
  await getTransferLegs(userId, groupId);
  await inTransaction(async (session) => {
    const result = await transactionsCollection().deleteMany({ userId, transferGroupId: groupId }, { session });
    if (result.deletedCount !== 2) throw conflict("This transfer changed while deleting. Refresh and try again.");
  });
}

// ---------------------------------------------------------------- cash withdrawals

/**
 * ATM withdrawals follow the user's chosen treatment:
 * - "expense" (default): recorded once as an expense in the "Cash Withdrawal" type.
 *   Cash purchases should then NOT be recorded again.
 * - "transfer": moved to a cash account; individual cash purchases are the expenses.
 */
export async function recordCashWithdrawal(
  userId: string,
  input: z.output<typeof cashWithdrawalSchema>,
): Promise<CreateResult> {
  const settings = await getSettings(userId);
  const account = await getActiveOwnedAccount(userId, new ObjectId(input.accountId));
  const amountPaise = toPaise(input.amount);
  const effectiveAt = resolveEffectiveAt(input.effectiveAt, settings.timezone);

  if (settings.cashWithdrawalMode === "transfer") {
    if (!input.cashAccountId) {
      throw badRequest("Choose the cash account that received the money.", { cashAccountId: ["Required."] });
    }
    const cash = await getActiveOwnedAccount(userId, new ObjectId(input.cashAccountId));
    if (cash._id.equals(account._id)) throw badRequest("Choose two different accounts.");
    return insertTransfer(
      userId,
      buildTransferLegs(userId, {
        groupId: new ObjectId(),
        from: account._id,
        to: cash._id,
        amountPaise,
        effectiveAt,
        comment: input.comment,
        name: "ATM withdrawal",
        isCashWithdrawal: true,
        idempotencyKey: input.idempotencyKey,
      }),
    );
  }

  let category = await findExpenseTypeByName(userId, CASH_WITHDRAWAL_CATEGORY);
  if (!category) {
    const created = await createExpenseType(userId, CASH_WITHDRAWAL_CATEGORY);
    category = await getOwnedExpenseType(userId, new ObjectId(created.id));
  }
  const now = new Date();
  return insertIdempotent(userId, {
    _id: new ObjectId(),
    userId,
    accountId: account._id,
    type: "expense",
    amountPaise,
    refundedPaise: 0,
    refunds: [],
    name: "ATM withdrawal",
    categoryId: category._id,
    effectiveAt,
    comment: input.comment,
    isCashWithdrawal: true,
    createdAt: now,
    updatedAt: now,
    idempotencyKey: input.idempotencyKey,
    version: 0,
  });
}

// ---------------------------------------------------------------- listing

export function buildListFilter(userId: string, query: TransactionListQuery, timeZone: string): Filter<TransactionDoc> {
  const filter: Filter<TransactionDoc> = { userId };
  switch (query.kind) {
    case "income":
      filter.type = "income";
      break;
    case "expense":
      filter.type = "expense";
      break;
    case "transfer":
      // One row per transfer (the outgoing leg) unless filtering by account.
      filter.type = query.accountId ? { $in: ["transfer_out", "transfer_in"] } : "transfer_out";
      break;
    case "all":
      if (!query.accountId) filter.type = { $ne: "transfer_in" };
      break;
  }
  if (query.accountId) filter.accountId = new ObjectId(query.accountId);
  if (query.categoryId && query.kind !== "income") filter.categoryId = new ObjectId(query.categoryId);
  const from = query.from ? parseLocalDate(query.from, timeZone) : null;
  const to = query.to ? parseLocalDate(query.to, timeZone) : null;
  if (from || to) {
    filter.effectiveAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lt: new Date(to.getTime() + 24 * 60 * 60 * 1000) } : {}),
    };
  }
  if (query.q) {
    const pattern = { $regex: escapeRegex(query.q), $options: "i" };
    filter.$or = [{ name: pattern }, { comment: pattern }, { reference: pattern }];
  }
  return filter;
}

const SORTS: Record<TransactionListQuery["sort"], Sort> = {
  date_desc: { effectiveAt: -1, _id: -1 },
  date_asc: { effectiveAt: 1, _id: 1 },
  amount_desc: { amountPaise: -1, _id: -1 },
  amount_asc: { amountPaise: 1, _id: 1 },
};

export async function listTransactions(userId: string, query: TransactionListQuery): Promise<Paginated<TransactionDTO>> {
  const { timezone } = await getSettings(userId);
  const filter = buildListFilter(userId, query, timezone);
  const [total, docs] = await Promise.all([
    transactionsCollection().countDocuments(filter),
    transactionsCollection()
      .find(filter)
      .sort(SORTS[query.sort])
      .skip((query.page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray(),
  ]);
  return {
    items: await toDTOs(userId, docs),
    page: query.page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Sum of the reportable amount (net of refunds) of every entry matching the list filters. */
export async function sumTransactions(userId: string, query: TransactionListQuery): Promise<number> {
  const { timezone } = await getSettings(userId);
  const rows = await transactionsCollection()
    .aggregate<{ total: number }>([
      { $match: buildListFilter(userId, query, timezone) },
      { $group: { _id: null, total: { $sum: reportableAmountExpression } } },
    ])
    .toArray();
  return rows[0]?.total ?? 0;
}

export async function recentTransactions(userId: string, limit = 8): Promise<TransactionDTO[]> {
  const docs = await transactionsCollection()
    .find({ userId, type: { $ne: "transfer_in" } })
    .sort({ effectiveAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
  return toDTOs(userId, docs);
}
