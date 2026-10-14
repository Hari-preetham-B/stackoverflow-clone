import bcrypt from "bcryptjs";
import User from "../models/auth.js";
import Otp from "../models/otp.js";
import PasswordReset from "../models/passwordReset.js";
import { createOtp, verifyStoredOtp } from "../services/otpService.js";
import { sendPasswordOtpEmail, sendNewPasswordEmail } from "../services/emailService.js";
import { generateRandomPassword } from "../services/passwordService.js";
import { sendPhoneVerification, verifyPhoneCode } from "../services/twilioService.js";

const normalize = (value) => String(value || "").trim();
const findUser = async (identifier) => {
  const value = normalize(identifier);
  const email = value.toLowerCase();
  const byEmail = await User.findOne({ email });
  if (byEmail) return { user: byEmail, channel: "email", identifier: email };
  const byPhone = await User.findOne({ phone: value });
  return { user: byPhone, channel: byPhone ? "phone" : null, identifier: value };
};

export const requestPasswordReset = async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ message: "Email or phone number is required" });
    const { user, channel, identifier: normalized } = await findUser(identifier);
    if (!user) return res.status(404).json({ message: "No account found with this email or phone number" });
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const count = await PasswordReset.countDocuments({ userId: user._id, requestedAt: { $gte: start } });
    if (count >= 1) return res.status(429).json({ message: "Password reset can only be requested once per day. Please try again tomorrow.", dailyLimitReached: true });
    if (channel === "email") {
      const { otp } = await createOtp({ userId: user._id, identifier: normalized, channel, purpose: "forgot_password" });
      try { await sendPasswordOtpEmail(normalized, otp); } catch (error) { await Otp.deleteMany({ userId: user._id, purpose: "forgot_password", verified: false }); throw error; }
    } else if (!process.env.TWILIO_VERIFY_SERVICE_SID && process.env.NODE_ENV !== "production") {
      const { otp } = await createOtp({ userId: user._id, identifier: normalized, channel: "email-fallback", purpose: "forgot_password" });
      await sendPasswordOtpEmail(user.email, otp);
    } else {
      await sendPhoneVerification(normalized);
    }
    await PasswordReset.create({ userId: user._id, identifier: normalized, channel });
    return res.json({ message: "OTP sent successfully", channel });
  } catch (error) { console.error("Password reset request error:", error); return res.status(503).json({ message: error.message || "Failed to process password reset request" }); }
};

export const verifyPasswordResetOtp = async (req, res) => {
  try {
    const { identifier, otp } = req.body;
    if (!identifier || !otp) return res.status(400).json({ message: "Identifier and OTP are required" });
    const { user, channel, identifier: normalized } = await findUser(identifier);
    if (!user) return res.status(404).json({ message: "User not found" });
    let valid = false;
    if (channel === "email") {
      const doc = await Otp.findOne({ userId: user._id, purpose: "forgot_password", verified: false }).sort({ createdAt: -1 });
      await verifyStoredOtp(doc, otp); valid = true;
    } else if (!process.env.TWILIO_VERIFY_SERVICE_SID && process.env.NODE_ENV !== "production") {
      const doc = await Otp.findOne({ userId: user._id, purpose: "forgot_password", channel: "email-fallback", verified: false }).sort({ createdAt: -1 });
      await verifyStoredOtp(doc, otp); valid = true;
    } else valid = await verifyPhoneCode(normalized, otp);
    if (!valid) return res.status(400).json({ message: "Invalid OTP" });
    const newPassword = generateRandomPassword(12);
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    const latestReset = await PasswordReset.findOne({ userId: user._id, completedAt: null }).sort({ requestedAt: -1 });
    if (latestReset) { latestReset.completedAt = new Date(); await latestReset.save(); }
    if (user.email) await sendNewPasswordEmail(user.email, newPassword);
    return res.json({ message: "OTP verified. A new temporary password has been sent to your email." });
  } catch (error) { const status = /expired|Invalid OTP|Maximum OTP/i.test(error.message) ? 400 : 500; return res.status(status).json({ message: error.message || "Failed to verify OTP" }); }
};
