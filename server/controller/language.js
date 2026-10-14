import User from "../models/auth.js";
import Otp from "../models/otp.js";
import { createOtp, verifyStoredOtp } from "../services/otpService.js";
import { sendEmail } from "../services/emailService.js";
import { sendPhoneVerification, verifyPhoneCode } from "../services/twilioService.js";

const allowed = ["en", "es", "hi", "pt", "zh", "fr"];

export const requestLanguageOtp = async (req, res) => {
  try {
    const { language } = req.body;
    if (!allowed.includes(language)) return res.status(400).json({ message: "Unsupported language" });
    const user = await User.findById(req.userid);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (language === "fr") {
      const { otp } = await createOtp({ userId: user._id, identifier: user.email, channel: "email", purpose: "language_change" });
      await sendEmail({ to: user.email, subject: "Language change verification", text: `Your language-change OTP is ${otp}. It expires in 10 minutes.` });
      return res.json({ message: "OTP sent to your email", channel: "email" });
    }
    if (!user.phone) return res.status(400).json({ message: "Add a phone number before changing to this language" });
    if (!process.env.TWILIO_VERIFY_SERVICE_SID && process.env.NODE_ENV !== "production") {
      const { otp } = await createOtp({ userId: user._id, identifier: user.phone, channel: "email-fallback", purpose: "language_change" });
      await sendEmail({ to: user.email, subject: "Language change verification", text: `Twilio is not configured locally. Your development fallback OTP is ${otp}. It expires in 10 minutes.` });
      return res.json({ message: "Twilio is not configured locally. OTP sent to your email as a development fallback.", channel: "email-fallback" });
    }
    await sendPhoneVerification(user.phone);
    return res.json({ message: "OTP sent to your mobile number", channel: "phone" });
  } catch (error) { return res.status(503).json({ message: error.message || "Unable to send language OTP" }); }
};

export const verifyLanguageOtp = async (req, res) => {
  try {
    const { language, otp } = req.body;
    if (!allowed.includes(language) || !otp) return res.status(400).json({ message: "Language and OTP are required" });
    const user = await User.findById(req.userid);
    if (!user) return res.status(404).json({ message: "User not found" });
    let valid = false;
    if (language === "fr") {
      const doc = await Otp.findOne({ userId: user._id, purpose: "language_change", verified: false }).sort({ createdAt: -1 });
      await verifyStoredOtp(doc, otp);
      valid = true;
    } else if (!process.env.TWILIO_VERIFY_SERVICE_SID && process.env.NODE_ENV !== "production") {
      const doc = await Otp.findOne({ userId: user._id, purpose: "language_change", channel: "email-fallback", verified: false }).sort({ createdAt: -1 });
      await verifyStoredOtp(doc, otp);
      valid = true;
    } else {
      if (!user.phone) return res.status(400).json({ message: "Phone number is required" });
      valid = await verifyPhoneCode(user.phone, otp);
    }
    if (!valid) return res.status(400).json({ message: "Invalid OTP" });
    user.preferredLanguage = language;
    await user.save();
    return res.json({ message: "Language updated", data: { preferredLanguage: language } });
  } catch (error) { return res.status(400).json({ message: error.message || "Language verification failed" }); }
};
