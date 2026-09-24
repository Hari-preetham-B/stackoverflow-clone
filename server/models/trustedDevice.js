import mongoose from "mongoose";

const trustedDeviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    deviceFingerprint: {
      type: String,
      required: true,
      index: true,
    },

    device: {
      type: String,
      default: "Unknown",
    },

    browser: {
      type: String,
      default: "Unknown",
    },

    os: {
      type: String,
      default: "Unknown",
    },

    ipAddress: {
      type: String,
      default: "Unknown",
    },

    lastUsedAt: {
      type: Date,
      default: Date.now,
    },

    trustedAt: {
      type: Date,
      default: Date.now,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

trustedDeviceSchema.index(
  { userId: 1, deviceFingerprint: 1 },
  { unique: true },
);

export default mongoose.model("TrustedDevice", trustedDeviceSchema);
