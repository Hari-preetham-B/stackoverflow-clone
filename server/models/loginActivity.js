import mongoose from "mongoose";

const loginActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
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

    isNewDevice: {
      type: Boolean,
      default: false,
    },

    success: {
      type: Boolean,
      default: true,
    },

    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("loginActivity", loginActivitySchema);
