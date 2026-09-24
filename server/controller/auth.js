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

export const signup = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "Username, email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await user.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await user.create({
      username,
      email: normalizedEmail,
      password: hashedPassword,
    });

    // Create a security session for the newly registered user
    const { session } = await createSession({
      userId: newUser._id,
      req,
      isTrusted: true,
      isActive: true,
    });

    // Record signup/login activity
    await createLoginActivity({
      userId: newUser._id,
      req,
      sessionId: session._id,
      event: "signup",
      success: true,
    });

    const token = jwt.sign(
      {
        id: newUser._id.toString(),
        email: newUser.email,
        sessionId: session._id.toString(),
        tokenId: session.tokenId,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "24h",
      },
    );

    const safeUser = {
      _id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      reputation: newUser.reputation,
      preferredLanguage: newUser.preferredLanguage,
      profileCompleted: newUser.profileCompleted,
      subscriptionPlan: newUser.subscriptionPlan,
      subscriptionStatus: newUser.subscriptionStatus,
    };

    return res.status(201).json({
      message: "User registered successfully",
      data: safeUser,
      token,
      isNewDevice: false,
    });
  } catch (error) {
    console.error("Signup error:", error);

    return res.status(500).json({
      message: "Server error during signup",
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

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await user
      .findOne({
        email: normalizedEmail,
      })
      .select("+password");

    if (!existingUser) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const passwordMatch = await bcrypt.compare(password, existingUser.password);

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const deviceInfo = getDeviceInfo(req);

    const knownDevice = await isKnownDevice({
      userId: existingUser._id,
      deviceFingerprint: deviceInfo.fingerprint,
    });

    const isNewDevice = !knownDevice;

    const { session } = await createSession({
      userId: existingUser._id,
      req,
      isTrusted: knownDevice,
      isActive: !isNewDevice,
    });

    await createLoginActivity({
      userId: existingUser._id,
      req,
      sessionId: session._id,
      event: isNewDevice ? "new_device_login" : "login",
      success: true,
    });

    // New device requires email OTP verification.
    if (isNewDevice) {
      const verification = await createLoginVerification({
        userId: existingUser._id,
        sessionId: session._id,
        deviceInfo,
        email: existingUser.email,
      });

      return res.status(200).json({
        message: "New device detected. OTP sent to your email.",
        requiresOtp: true,
        verificationId: verification._id,
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

    return res.status(200).json({
      message: "Login successful",
      data: safeUser,
      token,
      isNewDevice: false,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Server error during login",
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
