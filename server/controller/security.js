import mongoose from "mongoose";
import Session from "../models/session.js";
import LoginActivity from "../models/loginActivity.js";
import jwt from "jsonwebtoken";

import LoginVerification from "../models/loginVerification.js";
import Otp from "../models/otp.js";

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
      .select(
        "browser os deviceType ipAddress location isTrusted lastActive createdAt expiresAt",
      )
      .sort({ lastActive: -1 });

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
      .select(
        "browser os deviceType ipAddress location isNewDevice success timestamp",
      )
      .sort({ timestamp: -1 })
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
    const { verificationId, otp, trustDevice = false } = req.body;

    if (!verificationId || !otp) {
      return res.status(400).json({
        message: "Verification ID and OTP are required",
      });
    }

    const verification = await LoginVerification.findOne({
      _id: verificationId,
      verified: false,
    });

    if (!verification) {
      return res.status(404).json({
        message: "Login verification not found or already completed",
      });
    }

    if (verification.expiresAt < new Date()) {
      return res.status(400).json({
        message: "OTP has expired",
      });
    }

    const valid = await verifyLoginOtp({
      verification,
      otp,
    });

    if (!valid) {
      return res.status(400).json({
        message: "Invalid OTP",
      });
    }

    verification.verified = true;
    verification.trustDevice = Boolean(trustDevice);

    await verification.save();

    const session = await Session.findById(verification.sessionId);

    if (!session) {
      return res.status(404).json({
        message: "Session not found",
      });
    }

    session.isTrusted = Boolean(trustDevice);

    session.isActive = true;
    session.lastActive = new Date();

    await session.save();

    const token = jwt.sign(
      {
        id: verification.userId,
        email: verification.email,
        sessionId: session._id,
        tokenId: session.tokenId,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "24h",
      },
    );

    await Otp.updateMany(
      {
        userId: verification.userId,
        purpose: "new_device",
        verified: false,
      },
      {
        $set: {
          verified: true,
        },
      },
    );

    return res.status(200).json({
      message: "New device verified successfully",
      token,
      trustedDevice: session.isTrusted,
    });
  } catch (error) {
    console.error("New device verification error:", error);

    return res.status(500).json({
      message: "Failed to verify new device",
    });
  }
};
