import mongoose from "mongoose";
import User from "../models/auth.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createSession, isKnownDevice, createLoginActivity, updateTrustedDeviceUsage } from "../services/securityService.js";
import { getDeviceInfo } from "../services/deviceService.js";
import { createLoginVerification } from "../services/loginSecurityService.js";
import { awardReputation } from "../services/reputationService.js";

export const safeUser = (doc) => {
  if (!doc) return null;
  const data = doc.toObject ? doc.toObject() : { ...doc };
  delete data.password;
  data.username = data.name;
  return data;
};

const signToken = (user, session) => jwt.sign({ id: user._id.toString(), email: user.email, sessionId: session._id.toString(), tokenId: session.tokenId }, process.env.JWT_SECRET, { expiresIn: "24h" });

const calculateProfileCompletion = ({ name, email, about, tags, phone }) => Boolean(name && email && about?.trim() && phone && Array.isArray(tags) && tags.length > 0);

export const signup = async (req, res) => {
  try {
    const { name, username, email, password, phone } = req.body;
    const displayName = (name || username || "").trim();
    if (!displayName || !email || !password) return res.status(400).json({ message: "Name, email and password are required" });
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ message: "Password must contain at least 8 characters, one letter and one number" });
    const normalizedEmail = email.toLowerCase().trim();
    if (await User.findOne({ email: normalizedEmail })) return res.status(409).json({ message: "User already exists" });
    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await User.create({ name: displayName, email: normalizedEmail, phone: phone || null, password: hashedPassword, role: process.env.ADMIN_EMAIL?.toLowerCase() === normalizedEmail ? "admin" : "user" });
    const { session } = await createSession({ userId: newUser._id, req, isTrusted: true, isActive: true });
    await createLoginActivity({ userId: newUser._id, req, sessionId: session._id, event: "signup", success: true });
    const token = signToken(newUser, session);
    return res.status(201).json({ message: "User registered successfully", data: safeUser(newUser), token, isNewDevice: false });
  } catch (error) { console.error("Signup error:", error); return res.status(500).json({ message: "Server error during signup" }); }
};

export const login = async (req, res) => {
  const normalizedEmail = String(req.body.email || "").toLowerCase().trim();
  try {
    const { password } = req.body;
    if (!normalizedEmail || !password) return res.status(400).json({ message: "Email and password are required" });
    const existingUser = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!existingUser) return res.status(401).json({ message: "Invalid email or password" });
    const passwordMatch = await bcrypt.compare(password, existingUser.password);
    if (!passwordMatch) {
      await createLoginActivity({ userId: existingUser._id, req, event: "login_failed", success: false }).catch(() => {});
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const deviceInfo = getDeviceInfo(req);
    const knownDevice = await isKnownDevice({ userId: existingUser._id, deviceFingerprint: deviceInfo.fingerprint });
    const { session } = await createSession({ userId: existingUser._id, req, isTrusted: knownDevice, isActive: knownDevice });
    await createLoginActivity({ userId: existingUser._id, req, sessionId: session._id, event: knownDevice ? "login" : "new_device_login", success: true });
    if (!knownDevice) {
      try {
        const verification = await createLoginVerification({ userId: existingUser._id, sessionId: session._id, deviceInfo, email: existingUser.email });
        return res.json({ message: "New device detected. OTP sent to your email.", requiresOtp: true, verificationId: verification._id });
      } catch (error) {
        session.isActive = false; session.revokedAt = new Date(); await session.save();
        await createLoginActivity({ userId: existingUser._id, req, sessionId: session._id, event: "new_device_otp_failed", success: false }).catch(() => {});
        return res.status(503).json({ message: "Unable to send device verification OTP" });
      }
    }
    await updateTrustedDeviceUsage({ userId: existingUser._id, deviceFingerprint: deviceInfo.fingerprint, ipAddress: deviceInfo.ipAddress });
    return res.json({ message: "Login successful", data: safeUser(existingUser), token: signToken(existingUser, session), isNewDevice: false });
  } catch (error) { console.error("Login error:", error); return res.status(500).json({ message: "Server error during login" }); }
};

export const getCurrentUser = async (req, res) => {
  try { const current = await User.findById(req.userid).select("-password"); if (!current) return res.status(404).json({ message: "User not found" }); return res.json({ data: safeUser(current) }); }
  catch (error) { return res.status(500).json({ message: "Something went wrong" }); }
};

export const getallusers = async (_req, res) => { try { return res.json({ data: await User.find().select("name reputation preferredLanguage subscriptionPlan profileCompleted joinDate about tags role") }); } catch { return res.status(500).json({ message: "Something went wrong" }); } };

export const updateprofile = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "User unavailable" });
  if (id.toString() !== req.userid.toString()) return res.status(403).json({ message: "You can only update your own profile" });
  try {
    const current = await User.findById(id);
    if (!current) return res.status(404).json({ message: "User not found" });
    const { name, about, tags, phone, billingDetails } = req.body.editForm || req.body;
    const wasComplete = current.profileCompleted;
    if (name !== undefined) current.name = String(name).trim();
    if (about !== undefined) current.about = String(about);
    if (tags !== undefined) current.tags = Array.isArray(tags) ? tags : current.tags;
    if (phone !== undefined) current.phone = phone;
    if (billingDetails) current.billingDetails = { ...current.billingDetails?.toObject?.(), ...billingDetails };
    current.profileCompleted = calculateProfileCompletion(current);
    await current.save();
    if (!wasComplete && current.profileCompleted) await awardReputation({ userId: current._id, amount: 10, reason: "Profile completed", eventKey: `profile:${current._id}:completed`, relatedType: "user", relatedId: current._id });
    return res.json({ data: safeUser(current) });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Something went wrong" }); }
};

