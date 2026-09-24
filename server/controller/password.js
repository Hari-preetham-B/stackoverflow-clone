import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import User from "../models/auth.js";
import Otp from "../models/otp.js";
import PasswordReset from "../models/passwordReset.js";

import { createOtp, verifyOtp } from "../services/otpService.js";

import {
  sendPasswordOtpEmail,
  sendNewPasswordEmail,
} from "../services/emailService.js";

import { generateRandomPassword } from "../services/passwordService.js";

const normalizeIdentifier = (identifier) => {
  return identifier.trim().toLowerCase();
};

const findUserByIdentifier = async (identifier) => {
  const normalizedIdentifier = normalizeIdentifier(identifier);

  let user = await User.findOne({
    email: normalizedIdentifier,
  });

  let channel = "email";

  if (!user) {
    user = await User.findOne({
      phone: identifier.trim(),
    });

    channel = "phone";
  }

  return {
    user,
    channel,
    identifier: channel === "email" ? normalizedIdentifier : identifier.trim(),
  };
};

/*
  STEP 1
  Request OTP
*/
export const requestPasswordReset = async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier) {
      return res.status(400).json({
        message: "Email or phone number is required",
      });
    }

    const {
      user,
      channel,
      identifier: normalizedIdentifier,
    } = await findUserByIdentifier(identifier);

    if (!user) {
      return res.status(404).json({
        message: "No account found with this email or phone number",
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const requestCount = await PasswordReset.countDocuments({
      userId: user._id,
      requestedAt: {
        $gte: startOfDay,
        $lt: endOfDay,
      },
    });

    if (requestCount >= 1) {
      return res.status(429).json({
        message:
          "Password reset can only be requested once per day. Please try again tomorrow.",
        dailyLimitReached: true,
      });
    }

    const { otp } = await createOtp({
      userId: user._id,
      identifier: normalizedIdentifier,
      channel,
      purpose: "forgot_password",
    });

    if (channel === "email") {
      await sendPasswordOtpEmail(normalizedIdentifier, otp);
    } else {
      /*
    Twilio SMS implementation will be added here.
  */
      return res.status(501).json({
        message: "Phone OTP service is not configured yet. Please use email.",
      });
    }

    await PasswordReset.create({
      userId: user._id,
      identifier: normalizedIdentifier,
      channel,
    });

    return res.status(200).json({
      message: "OTP sent successfully",
      channel,
    });
  } catch (error) {
    console.error("Password reset request error:", error);

    return res.status(500).json({
      message: "Failed to process password reset request",
    });
  }
};

/*
  STEP 2
  Verify OTP
*/
export const verifyPasswordResetOtp = async (req, res) => {
  try {
    const { identifier, otp } = req.body;

    if (!identifier || !otp) {
      return res.status(400).json({
        message: "Identifier and OTP are required",
      });
    }

    const { user } = await findUserByIdentifier(identifier);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const otpDocument = await Otp.findOne({
      userId: user._id,
      purpose: "forgot_password",
      verified: false,
    }).sort({ createdAt: -1 });

    if (!otpDocument) {
      return res.status(400).json({
        message: "OTP not found or already used",
      });
    }

    if (otpDocument.expiresAt < new Date()) {
      return res.status(400).json({
        message: "OTP has expired",
      });
    }

    const isValid = await verifyOtp(otp, otpDocument.otpHash);

    if (!isValid) {
      return res.status(400).json({
        message: "Invalid OTP",
      });
    }

    otpDocument.verified = true;
    await otpDocument.save();

    const newPassword = generateRandomPassword(12);

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    user.password = hashedPassword;
    await user.save();

    const latestReset = await PasswordReset.findOne({
      userId: user._id,
      completedAt: null,
    }).sort({ requestedAt: -1 });

    if (latestReset) {
      latestReset.completedAt = new Date();
      await latestReset.save();
    }

    if (user.email) {
      await sendNewPasswordEmail(user.email, newPassword);
    }

    return res.status(200).json({
      message:
        "OTP verified. A new temporary password has been sent to your email.",
    });
  } catch (error) {
    console.error("OTP verification error:", error);

    return res.status(500).json({
      message: "Failed to verify OTP",
    });
  }
};
