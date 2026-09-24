import bcrypt from "bcryptjs";
import LoginVerification from "../models/loginVerification.js";
import { createOtp } from "./otpService.js";
import { sendEmail } from "./emailService.js";
import { createTrustedDevice } from "./securityService.js";

export const createLoginVerification = async ({
  userId,
  sessionId,
  deviceInfo,
  email,
}) => {
  const otp = createOtp();
  const otpHash = await bcrypt.hash(otp, 10);

  const verification = await LoginVerification.create({
    userId,
    sessionId,
    deviceFingerprint: deviceInfo.fingerprint,
    device: deviceInfo.device,
    browser: deviceInfo.browser,
    os: deviceInfo.os,
    ipAddress: deviceInfo.ipAddress,
    email,
    otpHash,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    verified: false,
    trustDevice: true,
    attempts: 0,
    maxAttempts: 5,
  });

  await sendEmail({
    to: email,
    subject: "New device login verification",
    text: `Your Stack Overflow clone verification OTP is ${otp}. It expires in 10 minutes.`,
  });

  return verification;
};

export const verifyLoginOtp = async ({ verificationId, otp }) => {
  const verification = await LoginVerification.findById(verificationId);

  if (!verification) {
    throw new Error("Verification request not found");
  }

  if (verification.verified) {
    throw new Error("Verification already completed");
  }

  if (verification.expiresAt < new Date()) {
    throw new Error("OTP has expired");
  }

  if (verification.attempts >= verification.maxAttempts) {
    throw new Error("Maximum OTP attempts exceeded");
  }

  const isValid = await bcrypt.compare(otp, verification.otpHash);

  if (!isValid) {
    verification.attempts += 1;
    await verification.save();

    if (verification.attempts >= verification.maxAttempts) {
      throw new Error("Maximum OTP attempts exceeded");
    }

    throw new Error(
      `Invalid OTP. ${verification.maxAttempts - verification.attempts} attempts remaining`,
    );
  }

  verification.verified = true;
  await verification.save();

  if (verification.trustDevice) {
    await createTrustedDevice({
      userId: verification.userId,
      deviceInfo: {
        fingerprint: verification.deviceFingerprint,
        device: verification.device,
        browser: verification.browser,
        os: verification.os,
        ipAddress: verification.ipAddress,
      },
    });
  }

  return verification;
};
