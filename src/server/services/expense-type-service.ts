import "server-only";
import { ObjectId } from "mongodb";
import { DEFAULT_EXPENSE_TYPES } from "@/lib/finance/constants";
import type { ExpenseTypeDTO } from "@/lib/finance/types";
import { expenseTypesCollection, transactionsCollection, type ExpenseTypeDoc } from "@/server/db/collections";
import { badRequest, conflict, isDuplicateKeyError, notFound } from "@/server/errors";

export function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function toDTO(doc: ExpenseTypeDoc): ExpenseTypeDTO {
  return { id: doc._id.toHexString(), name: doc.name, isDefault: doc.isDefault, isArchived: doc.isArchived };
}

/**
 * Seeds the default expense types for a user the first time they are needed.
 * Each user gets their own editable copies; the unique index makes concurrent seeding safe.
 */
async function ensureDefaults(userId: string): Promise<void> {
  const collection = expenseTypesCollection();
  if ((await collection.countDocuments({ userId }, { limit: 1 })) > 0) return;
  const now = new Date();
  try {
    await collection.insertMany(
      DEFAULT_EXPENSE_TYPES.map((name) => ({
        _id: new ObjectId(),
        userId,
        name,
        nameKey: nameKey(name),
        isDefault: true,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      })),
      { ordered: false },
    );
  } catch (error) {
    if (!isDuplicateKeyError(error) && !(error instanceof Error && error.name === "MongoBulkWriteError")) throw error;
  }
}

export async function listExpenseTypes(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<ExpenseTypeDTO[]> {
  await ensureDefaults(userId);
  const filter = options.includeArchived ? { userId } : { userId, isArchived: false };
  const docs = await expenseTypesCollection().find(filter).sort({ isArchived: 1, name: 1 }).toArray();
  return docs.map(toDTO);
}

/** Loads an expense type only if it belongs to `userId`; otherwise reports "not found". */
export async function getOwnedExpenseType(userId: string, id: ObjectId): Promise<ExpenseTypeDoc> {
  const doc = await expenseTypesCollection().findOne({ _id: id, userId });
  if (!doc) throw notFound("Expense type");
  return doc;
}

export async function findExpenseTypeByName(userId: string, name: string): Promise<ExpenseTypeDoc | null> {
  await ensureDefaults(userId);
  return expenseTypesCollection().findOne({ userId, nameKey: nameKey(name) });
}

export async function createExpenseType(userId: string, name: string): Promise<ExpenseTypeDTO> {
  await ensureDefaults(userId);
  const now = new Date();
  const doc: ExpenseTypeDoc = {
    _id: new ObjectId(),
    userId,
    name: name.trim(),
    nameKey: nameKey(name),
    isDefault: false,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await expenseTypesCollection().insertOne(doc);
  } catch (error) {
    if (isDuplicateKeyError(error)) throw conflict(`An expense type named "${doc.name}" already exists.`);
    throw error;
  }
  return toDTO(doc);
}

export async function updateExpenseType(
  userId: string,
  id: ObjectId,
  input: { name?: string; isArchived?: boolean },
): Promise<ExpenseTypeDTO> {
  await getOwnedExpenseType(userId, id);
  const set: Partial<ExpenseTypeDoc> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    set.name = input.name.trim();
    set.nameKey = nameKey(input.name);
  }
  if (input.isArchived !== undefined) {
    if (input.isArchived) {
      const active = await expenseTypesCollection().countDocuments({ userId, isArchived: false, _id: { $ne: id } });
      if (active === 0) throw badRequest("Keep at least one active expense type.");
    }
    set.isArchived = input.isArchived;
  }
  try {
    const updated = await expenseTypesCollection().findOneAndUpdate(
      { _id: id, userId },
      { $set: set },
      { returnDocument: "after" },
    );
    if (!updated) throw notFound("Expense type");
    return toDTO(updated);
  } catch (error) {
    if (isDuplicateKeyError(error)) throw conflict(`An expense type named "${set.name}" already exists.`);
    throw error;
  }
}

/** Deletes an unused expense type. Types referenced by expenses must be archived instead. */
export async function deleteExpenseType(userId: string, id: ObjectId): Promise<void> {
  await getOwnedExpenseType(userId, id);
  const used = await transactionsCollection().countDocuments({ userId, categoryId: id }, { limit: 1 });
  if (used > 0) throw conflict("This expense type is used by existing expenses. Archive it instead.");
  const active = await expenseTypesCollection().countDocuments({ userId, isArchived: false, _id: { $ne: id } });
  if (active === 0) throw badRequest("Keep at least one active expense type.");
  await expenseTypesCollection().deleteOne({ _id: id, userId });
}
