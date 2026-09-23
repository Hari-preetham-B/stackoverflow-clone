import crypto from "crypto";
import bcrypt from "bcryptjs";
import Otp from "../models/otp.js";

export const generateOtp = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

export const hashOtp = async (otp) => {
  return await bcrypt.hash(otp, 10);
};

export const verifyOtp = async (otp, hash) => {
  return await bcrypt.compare(otp, hash);
};

export const createOtp = async ({ userId, identifier, channel, purpose }) => {
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);

  await Otp.deleteMany({
    userId,
    purpose,
    verified: false,
  });

  const otpDocument = await Otp.create({
    userId,
    identifier,
    channel,
    purpose,
    otpHash,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  return {
    otp,
    otpDocument,
  };
};
