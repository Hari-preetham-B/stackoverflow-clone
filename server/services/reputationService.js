import User from "../models/auth.js";
import ReputationLog from "../models/reputationLog.js";

export const awardReputation = async ({ userId, amount, reason, eventKey, actorId = null, relatedType = null, relatedId = null, metadata = {}, session = null, skipBalance = false }) => {
  if (!userId || !amount) return { changed: false };
  if (eventKey) {
    const existing = await ReputationLog.findOne({ eventKey });
    if (existing) return { changed: false, log: existing };
  }
  const writeOpts = session ? { session } : {};
  const [log] = await ReputationLog.create([{ userId, actorId, amount, reason, eventKey, relatedType, relatedId, metadata }], writeOpts);
  // `skipBalance` lets a caller that already applied an atomic guarded update
  // record the audit row without adjusting the balance a second time.
  const user = skipBalance ? null : await User.findByIdAndUpdate(userId, { $inc: { reputation: amount } }, { new: true, ...writeOpts });
  return { changed: true, log, user };
};

/**
 * Atomically debits a reputation balance, but only if the user can afford it.
 *
 * The `$gte` guard is part of the same document update as the `$inc`, so MongoDB
 * applies filter-then-increment as one atomic operation. Two concurrent transfers
 * therefore cannot both pass a read-only `reputation >= amount` check and drive
 * the balance negative: the second update simply matches nothing.
 *
 * Returns the updated user, or null when the balance is insufficient.
 */
export const debitReputation = async ({ userId, amount }) => {
  if (!userId || !Number.isFinite(amount) || amount <= 0) return null;
  return User.findOneAndUpdate(
    { _id: userId, reputation: { $gte: amount } },
    { $inc: { reputation: -amount } },
    { new: true },
  );
};

/** Undoes a debit when the rest of a multi-step operation failed. */
export const refundReputation = async ({ userId, amount }) => {
  if (!userId || !Number.isFinite(amount) || amount === 0) return null;
  return User.findByIdAndUpdate(userId, { $inc: { reputation: amount } }, { new: true });
};

// Only the public display name of the other party is exposed; the email address
// of a transfer counterparty must not leak through a reputation history.
export const getReputationHistory = (userId) => ReputationLog.find({ userId }).sort({ createdAt: -1 }).limit(100).populate("actorId", "name");

export const getPrivileges = (reputation) => ({
  canVote: reputation >= 15,
  canComment: reputation >= 50,
  canTransfer: reputation > 50,
  privilege50: reputation >= 50,
  privilege100: reputation >= 100,
  privilege250: reputation >= 250,
  privilege500: reputation >= 500,
});
