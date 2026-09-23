import mongoose from "mongoose";
import user from "../models/auth.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

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

export const Login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Password has select:false in the schema,
    // so explicitly request it here.
    const existinguser = await user
      .findOne({
        email: normalizedEmail,
      })
      .select("+password");

    if (!existinguser) {
      return res.status(404).json({
        message: "User does not exist",
      });
    }

    const ispasswordcorrect = await bcrypt.compare(
      password,
      existinguser.password,
    );

    if (!ispasswordcorrect) {
      return res.status(400).json({
        message: "Invalid password",
      });
    }

    const token = jwt.sign(
      {
        email: existinguser.email,
        id: existinguser._id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      },
    );

    return res.status(200).json({
      data: getSafeUser(existinguser),
      token,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Something went wrong",
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
