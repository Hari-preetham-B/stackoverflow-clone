import User from "../models/auth.js";
import ReputationLog from "../models/reputationLog.js";

export const awardReputation = async ({ userId, amount, reason, eventKey, actorId = null, relatedType = null, relatedId = null, metadata = {} }) => {
  if (!userId || !amount) return { changed: false };
  if (eventKey) {
    const existing = await ReputationLog.findOne({ eventKey });
    if (existing) return { changed: false, log: existing };
  }
  const log = await ReputationLog.create({ userId, actorId, amount, reason, eventKey, relatedType, relatedId, metadata });
  const updated = await User.findByIdAndUpdate(userId, { $inc: { reputation: amount } }, { new: true });
  return { changed: true, log, user: updated };
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
