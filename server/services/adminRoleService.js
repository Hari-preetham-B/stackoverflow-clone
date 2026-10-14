import User from "../models/auth.js";

/**
 * ADMIN_EMAIL is the documented source of truth for the administrator (see
 * .env.example). Accounts created before the `role` field existed carry no role,
 * which makes every admin route reject them with 403. This reconciles the
 * configured account once at startup. It is an idempotent $set scoped to that one
 * email: it never inserts a user, never touches any other account and never
 * changes credentials.
 *
 * The Mongoose model is injectable (defaulting to the real one) purely so the
 * behaviour can be unit tested without a live database connection.
 *
 * @param {object} [UserModel] model exposing updateMany(filter, update)
 * @returns {Promise<void>}
 */
export const syncAdminRole = async (UserModel = User) => {
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!adminEmail) return;
  try {
    const { modifiedCount } = await UserModel.updateMany(
      { email: adminEmail, role: { $ne: "admin" } },
      { $set: { role: "admin" } },
    );
    if (modifiedCount) console.log(`Admin role synced for the configured ADMIN_EMAIL (${modifiedCount} document)`);
  } catch (error) {
    console.error("Admin role sync skipped:", error.message);
  }
};