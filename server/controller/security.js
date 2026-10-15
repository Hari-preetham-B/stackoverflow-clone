import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Session from "../models/session.js";
import LoginActivity from "../models/loginActivity.js";
import User from "../models/auth.js";
import TrustedDevice from "../models/trustedDevice.js";
import { verifyLoginOtp } from "../services/loginSecurityService.js";
import { safeUser } from "./auth.js";

export const getActiveSessions = async (req, res) => {
  try { return res.json(await Session.find({ userId: req.userid, isActive: true, expiresAt: { $gt: new Date() } }).select("device browser os ipAddress location isTrusted lastActive createdAt expiresAt").sort({ lastActive: -1 })); }
  catch { return res.status(500).json({ message: "Failed to retrieve sessions" }); }
};

export const revokeSession = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.sessionId)) return res.status(400).json({ message: "Invalid session ID" });
    const session = await Session.findOne({ _id: req.params.sessionId, userId: req.userid, isActive: true });
    if (!session) return res.status(404).json({ message: "Session not found" });
    session.isActive = false; session.revokedAt = new Date(); await session.save();
    return res.json({ message: "Session revoked successfully" });
  } catch { return res.status(500).json({ message: "Failed to revoke session" }); }
};

export const getLoginActivity = async (req, res) => {
  try { return res.json({ data: await LoginActivity.find({ userId: req.userid }).sort({ createdAt: -1 }).limit(100) }); }
  catch { return res.status(500).json({ message: "Failed to retrieve login activity" }); }
};

export const verifyNewDevice = async (req, res) => {
  try {
    const { verificationId, otp, trustDevice = true } = req.body;
    if (!verificationId || !otp) return res.status(400).json({ message: "Verification ID and OTP are required" });
    // Guard before the lookup: a malformed id would otherwise raise an
    // unhandled Mongoose CastError and surface as a 500.
    if (!mongoose.Types.ObjectId.isValid(verificationId)) return res.status(400).json({ message: "Invalid verification ID" });
    const verification = await verifyLoginOtp({ verificationId, otp, trustDevice });
    const session = await Session.findById(verification.sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const existingUser = await User.findById(verification.userId);
    if (!existingUser) return res.status(404).json({ message: "User not found" });
    session.isActive = true; session.isTrusted = Boolean(trustDevice); session.lastActive = new Date(); await session.save();
    await LoginActivity.create({ userId: existingUser._id, sessionId: session._id, event: "new_device_verified", success: true, device: session.device, browser: session.browser, os: session.os, ipAddress: session.ipAddress, location: session.location });
    return res.json({ message: "New device verified successfully", data: safeUser(existingUser), token: jwt.sign({ id: existingUser._id.toString(), email: existingUser.email, sessionId: session._id.toString(), tokenId: session.tokenId }, process.env.JWT_SECRET, { expiresIn: "24h" }), trustedDevice: session.isTrusted });
  } catch (error) {
    const status = /not found|already completed/i.test(error.message) ? 404 : /expired|Invalid OTP|Maximum OTP/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ message: error.message || "Failed to verify new device" });
  }
};

export const getTrustedDevices = async (req, res) => {
  return res.json({ data: await TrustedDevice.find({ userId: req.userid, isActive: true, expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 }) });
};

export const revokeTrustedDevice = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.deviceId)) return res.status(400).json({ message: "Invalid device ID" });
  const device = await TrustedDevice.findOneAndUpdate({ _id: req.params.deviceId, userId: req.userid }, { isActive: false }, { new: true });
  if (!device) return res.status(404).json({ message: "Trusted device not found" });
  return res.json({ message: "Trusted device revoked" });
};
