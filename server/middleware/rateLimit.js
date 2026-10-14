/**
 * Small in-process fixed-window rate limiter.
 *
 * Implemented directly on Node's standard library so the project keeps its
 * zero-dependency posture. It is intentionally simple: a Map of counters with a
 * rolling reset time, pruned lazily. For a single-process deployment this is
 * sufficient to blunt credential stuffing, OTP brute force and OTP/email spam.
 * A multi-instance deployment would need a shared store (Redis) instead.
 */

const buckets = new Map();

const clientKey = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
};

// Drop expired buckets periodically so the Map cannot grow without bound.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000);
sweeper.unref?.();

/**
 * @param {object} options
 * @param {number} options.windowMs window length
 * @param {number} options.max     max requests allowed inside one window
 * @param {string} options.name    bucket namespace
 * @param {string} [options.message]
 * @param {(req: object) => string} [options.keyFn] extra key material
 */
export const createRateLimiter = ({ windowMs, max, name, message, keyFn }) => {
  return (req, res, next) => {
    const key = `${name}:${keyFn ? keyFn(req) : clientKey(req)}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ message: message || "Too many requests. Please try again later." });
    }
    return next();
  };
};

// Windows are deliberately generous so ordinary development and demo usage is
// never interrupted; these are backstops against automated abuse, not quotas.
export const loginLimiter = createRateLimiter({
  name: "login",
  windowMs: 15 * 60_000,
  max: 20,
  message: "Too many login attempts. Please try again later.",
  keyFn: (req) => `${clientKey(req)}:${String(req.body?.email || "").toLowerCase()}`,
});

export const passwordResetLimiter = createRateLimiter({
  name: "password-reset",
  windowMs: 60 * 60_000,
  max: 5,
  message: "Too many password reset requests. Please try again later.",
});

export const passwordOtpLimiter = createRateLimiter({
  name: "password-otp",
  windowMs: 15 * 60_000,
  max: 20,
  message: "Too many verification attempts. Please try again later.",
});

export const deviceVerifyLimiter = createRateLimiter({
  name: "device-verify",
  windowMs: 60 * 60_000,
  max: 20,
  message: "Too many verification attempts. Please try again later.",
});

export const languageOtpLimiter = createRateLimiter({
  name: "language-otp",
  windowMs: 15 * 60_000,
  max: 20,
  message: "Too many verification attempts. Please try again later.",
});

export const _resetForTests = () => buckets.clear();