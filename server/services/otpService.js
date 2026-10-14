import crypto from "crypto";
import bcrypt from "bcryptjs";
import Otp from "../models/otp.js";

export const generateOtp = () => crypto.randomInt(100000, 1000000).toString();
export const hashOtp = async (otp) => bcrypt.hash(otp, 10);
export const verifyOtp = async (otp, hash) => bcrypt.compare(otp, hash);

export const createOtp = async ({ userId, identifier, channel, purpose }) => {
  if (!userId || !identifier || !channel || !purpose) throw new Error("OTP parameters are incomplete");
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  await Otp.deleteMany({ userId, purpose, verified: false });
  const otpDocument = await Otp.create({ userId, identifier, channel, purpose, otpHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0, maxAttempts: 5 });
  return { otp, otpDocument };
};

export const verifyStoredOtp = async (otpDocument, otp) => {
  if (!otpDocument) throw new Error("OTP not found");
  if (otpDocument.verified) throw new Error("OTP already used");
  if (otpDocument.expiresAt < new Date()) throw new Error("OTP has expired");
  if (otpDocument.attempts >= otpDocument.maxAttempts) throw new Error("Maximum OTP attempts exceeded");
  const valid = await verifyOtp(otp, otpDocument.otpHash);
  if (!valid) {
    otpDocument.attempts += 1;
    await otpDocument.save();
    if (otpDocument.attempts >= otpDocument.maxAttempts) throw new Error("Maximum OTP attempts exceeded");
    throw new Error(`Invalid OTP. ${otpDocument.maxAttempts - otpDocument.attempts} attempts remaining`);
  }
  otpDocument.verified = true;
  await otpDocument.save();
  return true;
};
