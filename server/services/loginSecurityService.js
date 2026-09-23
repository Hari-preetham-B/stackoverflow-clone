import bcrypt from "bcryptjs";
import Otp from "../models/otp.js";
import LoginVerification from "../models/loginVerification.js";
import { createOtp } from "./otpService.js";
import { sendEmail } from "./emailService.js";

export const createLoginVerification = async ({
  userId,
  sessionId,
  email,
  deviceFingerprint,
}) => {
  const { otp } = await createOtp({
    userId,
    identifier: email,
    channel: "email",
    purpose: "new_device",
  });

  const otpDocument = await Otp.findOne({
    userId,
    purpose: "new_device",
    verified: false,
  }).sort({ createdAt: -1 });

  if (!otpDocument) {
    throw new Error("Failed to create login OTP");
  }

  await LoginVerification.deleteMany({
    userId,
    verified: false,
  });

  const verification = await LoginVerification.create({
    userId,
    sessionId,
    email,
    deviceFingerprint,
    otpHash: otpDocument.otpHash,
    expiresAt: otpDocument.expiresAt,
  });

  await sendEmail({
    to: email,
    subject: "Verify new device login",
    text: `
A login attempt was detected from a new device.

Your verification OTP is:

${otp}

This OTP is valid for 10 minutes.
    `,
    html: `
      <h2>New Device Verification</h2>

      <p>
        A login attempt was detected from a new device.
      </p>

      <p>Your verification OTP is:</p>

      <h1>${otp}</h1>

      <p>This OTP is valid for 10 minutes.</p>

      <p>
        If you did not attempt to log in,
        secure your account immediately.
      </p>
    `,
  });

  return verification;
};

export const verifyLoginOtp = async ({ verification, otp }) => {
  if (verification.expiresAt < new Date()) {
    return false;
  }

  return await bcrypt.compare(otp, verification.otpHash);
};
