import User from "../models/auth.js";
import Session from "../models/session.js";

/**
 * A suspension is in force when the flag is set AND either no expiry was given
 * (indefinite) or the expiry is still in the future. Expiry is evaluated at
 * request time rather than by a job, so a temporary suspension lifts itself the
 * moment it lapses with no background worker.
 */
export const isSuspended = (user) =>
  Boolean(user?.isSuspended) && (!user?.suspendedUntil || new Date(user.suspendedUntil) > new Date());

/**
 * Blocks content-creating and interaction endpoints for a suspended account.
 *
 * Reading is deliberately untouched: a suspended member can still browse, read
 * their history and delete their own posts. Only activity that adds content or
 * social signals (posts, comments, replies, likes, shares, bookmarks, follows,
 * reports) is refused, which is what "suspend" means in practice.
 */
export const requireNotSuspended = async (req, res, next) => {
  try {
    const user = await User.findById(req.userid).select("isSuspended suspendedUntil suspensionReason");
    if (!user) return res.status(401).json({ message: "Authentication required" });
    if (isSuspended(user)) {
      return res.status(403).json({
        message: "Your account is suspended from community activity",
        suspendedUntil: user.suspendedUntil ? new Date(user.suspendedUntil).toISOString() : null,
        reason: user.suspensionReason || null,
      });
    }
    return next();
  } catch {
    return res.status(500).json({ message: "Suspension check failed" });
  }
};

/** Suspend a user and cut off any session they already hold. */
export const suspend = async ({ user, reason, durationDays = null, actorId = null }) => {
  user.isSuspended = true;
  user.suspensionReason = reason;
  user.suspendedUntil = durationDays === null ? null : new Date(Date.now() + durationDays * 86400000);
  await user.save();
  // Existing JWTs stay cryptographically valid for up to 24h, so the sessions
  // backing them are revoked as part of the suspension.
  await Session.updateMany({ userId: user._id, isActive: true }, { isActive: false, revokedAt: new Date() });
  return user;
};

export const unsuspend = async ({ user, actorId = null }) => {
  user.isSuspended = false;
  user.suspendedUntil = null;
  user.suspensionReason = null;
  await user.save();
  return user;
};
