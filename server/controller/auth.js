import mongoose from "mongoose";
import user from "../models/auth.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  createSession,
  isKnownDevice,
  createLoginActivity,
} from "../services/securityService.js";
import { getDeviceInfo } from "../services/deviceService.js";
import { sendEmail } from "../services/emailService.js";
import { createLoginVerification } from "../services/loginSecurityService.js";
const getSafeUser = (userData) => {
  if (!userData) return null;

  const data = userData.toObject ? userData.toObject() : { ...userData };

  delete data.password;

  return data;
};

const calculateProfileCompletion = ({ name, email, about, tags, phone }) => {
  const fields = [
    name,
    email,
    about,
    phone,
    Array.isArray(tags) && tags.length > 0,
  ];

  const completedFields = fields.filter(Boolean).length;

  return completedFields === fields.length;
};

export const Signup = async (req, res) => {
  const { name, email, password, phone } = req.body;

  try {
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existinguser = await user.findOne({
      email: normalizedEmail,
    });

    if (existinguser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const hashpassword = await bcrypt.hash(password, 12);

    const newuser = await user.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: phone || null,
      password: hashpassword,
    });

    const token = jwt.sign(
      {
        email: newuser.email,
        id: newuser._id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      },
    );

    return res.status(201).json({
      data: getSafeUser(newuser),
      token,
    });
  } catch (error) {
    console.error("Signup error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existinguser = await user
      .findOne({
        email: normalizedEmail,
      })
      .select("+password");

    if (!existinguser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(
      password,
      existinguser.password,
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const deviceInfo = getDeviceInfo(req);

    const knownDevice = await isKnownDevice({
      userId: existinguser._id,
      deviceFingerprint: deviceInfo.deviceFingerprint,
    });

    const isNewDevice = !knownDevice;

    const { session } = await createSession({
      userId: existinguser._id,
      req,
      isTrusted: false,
      isActive: !isNewDevice,
    });

    await createLoginActivity({
      userId: existinguser._id,
      deviceInfo,
      isNewDevice,
      success: true,
    });
    if (isNewDevice) {
      const verification = await createLoginVerification({
        userId: existinguser._id,
        sessionId: session._id,
        email: existinguser.email,
        deviceFingerprint: deviceInfo.deviceFingerprint,
      });

      return res.status(200).json({
        requiresOtp: true,
        verificationId: verification._id,
        message: "New device detected. OTP has been sent to your email.",
      });
    }

    const token = jwt.sign(
      {
        id: existinguser._id,
        email: existinguser.email,
        sessionId: session._id,
        tokenId: session.tokenId,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "24h",
      },
    );

    if (isNewDevice && existinguser.email) {
      try {
        await sendEmail({
          to: existinguser.email,
          subject: "New device login detected",
          text: `
A new device has logged into your Stack Overflow Clone account.

Browser: ${deviceInfo.browser}
Operating System: ${deviceInfo.os}
Device: ${deviceInfo.deviceType}
IP Address: ${deviceInfo.ipAddress}
Time: ${new Date().toLocaleString()}

If this was not you, revoke the session from your security settings.
          `,
          html: `
            <h2>New Device Login</h2>

            <p>A new device has logged into your account.</p>

            <p>
              <strong>Browser:</strong>
              ${deviceInfo.browser}
            </p>

            <p>
              <strong>Operating System:</strong>
              ${deviceInfo.os}
            </p>

            <p>
              <strong>Device:</strong>
              ${deviceInfo.deviceType}
            </p>

            <p>
              <strong>IP Address:</strong>
              ${deviceInfo.ipAddress}
            </p>

            <p>
              <strong>Time:</strong>
              ${new Date().toLocaleString()}
            </p>

            <p>
              If this was not you, revoke the session from your security settings.
            </p>
          `,
        });
      } catch (emailError) {
        console.error("New device email failed:", emailError.message);
      }
    }

    const safeUser = getSafeUser(existinguser);

    return res.status(200).json({
      result: safeUser,
      token,
      isNewDevice,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Login failed",
    });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const currentuser = await user.findById(req.userid).select("-password");

    if (!currentuser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      data: currentuser,
    });
  } catch (error) {
    console.error("Get current user error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const getallusers = async (req, res) => {
  try {
    const alluser = await user.find().select("-password");

    return res.status(200).json({
      data: alluser,
    });
  } catch (error) {
    console.error("Get users error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;

  const { name, about, tags } = req.body.editForm || {};

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({
      message: "User unavailable",
    });
  }

  // A logged-in user can update only their own profile.
  if (_id.toString() !== req.userid.toString()) {
    return res.status(403).json({
      message: "You can only update your own profile",
    });
  }

  try {
    const existinguser = await user.findById(_id);

    if (!existinguser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    existinguser.name = name !== undefined ? name.trim() : existinguser.name;

    existinguser.about = about !== undefined ? about : existinguser.about;

    existinguser.tags = Array.isArray(tags) ? tags : existinguser.tags;

    existinguser.profileCompleted = calculateProfileCompletion(existinguser);

    await existinguser.save();

    return res.status(200).json({
      data: getSafeUser(existinguser),
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};
