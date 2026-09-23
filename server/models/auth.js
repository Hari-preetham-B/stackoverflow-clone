import mongoose from "mongoose";

const userschema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: null,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    about: {
      type: String,
      default: "",
    },

    tags: {
      type: [String],
      default: [],
    },

    joinDate: {
      type: Date,
      default: Date.now,
    },

    // Role / authorization
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    // Reputation
    reputation: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Language preference
    preferredLanguage: {
      type: String,
      enum: ["en", "es", "hi", "pt", "zh", "fr"],
      default: "en",
    },

    // Used for the +10 profile-completion reputation rule
    profileCompleted: {
      type: Boolean,
      default: false,
    },

    // Premium membership foundation
    subscriptionPlan: {
      type: String,
      enum: ["free", "bronze", "silver", "gold"],
      default: "free",
    },

    subscriptionStatus: {
      type: String,
      enum: ["active", "inactive", "pending", "cancelled", "expired", "halted"],
      default: "active",
    },

    subscriptionRenewalDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("user", userschema);
