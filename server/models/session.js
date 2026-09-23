import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },

    tokenId: {
      type: String,
      required: true,
      unique: true,
    },

    browser: {
      type: String,
      default: "Unknown",
    },

    os: {
      type: String,
      default: "Unknown",
    },

    deviceType: {
      type: String,
      default: "Unknown",
    },

    ipAddress: {
      type: String,
      default: "Unknown",
    },

    location: {
      type: String,
      default: "Unknown",
    },

    deviceFingerprint: {
      type: String,
      required: true,
    },

    isTrusted: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastActive: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("session", sessionSchema);
