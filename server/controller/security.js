import mongoose from "mongoose";
import Session from "../models/session.js";
import LoginActivity from "../models/loginActivity.js";
import user from "../models/auth.js";
import jwt from "jsonwebtoken";

import { verifyLoginOtp } from "../services/loginSecurityService.js";

export const getActiveSessions = async (req, res) => {
  try {
    const sessions = await Session.find({
      userId: req.userid,
      isActive: true,
      expiresAt: {
        $gt: new Date(),
      },
    })
      .select("device browser os ipAddress isTrusted createdAt expiresAt")
      .sort({ createdAt: -1 });

    return res.status(200).json(sessions);
  } catch (error) {
    console.error("Get active sessions error:", error);

    return res.status(500).json({
      message: "Failed to retrieve sessions",
    });
  }
};

export const revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        message: "Invalid session ID",
      });
    }

    const session = await Session.findOne({
      _id: sessionId,
      userId: req.userid,
      isActive: true,
    });

    if (!session) {
      return res.status(404).json({
        message: "Session not found",
      });
    }

    session.isActive = false;
    session.revokedAt = new Date();

    await session.save();

    return res.status(200).json({
      message: "Session revoked successfully",
    });
  } catch (error) {
    console.error("Revoke session error:", error);

    return res.status(500).json({
      message: "Failed to revoke session",
    });
  }
};

export const getLoginActivity = async (req, res) => {
  try {
    const activities = await LoginActivity.find({
      userId: req.userid,
    })
      .select("device browser os ipAddress event success createdAt")
      .sort({ createdAt: -1 })
      .limit(50);

    return res.status(200).json(activities);
  } catch (error) {
    console.error("Login activity error:", error);

    return res.status(500).json({
      message: "Failed to retrieve login activity",
    });
  }
};

export const verifyNewDevice = async (req, res) => {
  try {
    const { verificationId, otp } = req.body;

    if (!verificationId || !otp) {
      return res.status(400).json({
        message: "Verification ID and OTP are required",
      });
    }

    const verification = await verifyLoginOtp({
      verificationId,
      otp,
    });

    const session = await Session.findById(verification.sessionId);

    if (!session) {
      return res.status(404).json({
        message: "Session not found",
      });
    }

    session.isActive = true;
    session.isTrusted = verification.trustDevice;

    await session.save();

    const existingUser = await user.findById(verification.userId);

    if (!existingUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const token = jwt.sign(
      {
        id: existingUser._id.toString(),
        email: existingUser.email,
        sessionId: session._id.toString(),
        tokenId: session.tokenId,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "24h",
      },
    );

    const safeUser = {
      _id: existingUser._id,
      username: existingUser.username,
      email: existingUser.email,
      phone: existingUser.phone,
      role: existingUser.role,
      reputation: existingUser.reputation,
      preferredLanguage: existingUser.preferredLanguage,
      profileCompleted: existingUser.profileCompleted,
      subscriptionPlan: existingUser.subscriptionPlan,
      subscriptionStatus: existingUser.subscriptionStatus,
    };

    await LoginActivity.create({
      userId: existingUser._id,
      sessionId: session._id,
      event: "new_device_verified",
      success: true,
      device: session.device,
      browser: session.browser,
      os: session.os,
      ipAddress: session.ipAddress,
    });

    return res.status(200).json({
      message: "New device verified successfully",
      data: safeUser,
      token,
      trustedDevice: session.isTrusted,
    });
  } catch (error) {
    console.error("New device verification error:", error);

    if (
      error.message === "Verification request not found" ||
      error.message === "Verification already completed"
    ) {
      return res.status(404).json({
        message: error.message,
      });
    }

    if (
      error.message === "OTP has expired" ||
      error.message === "Maximum OTP attempts exceeded" ||
      error.message.startsWith("Invalid OTP")
    ) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Failed to verify new device",
    });
  }
};
