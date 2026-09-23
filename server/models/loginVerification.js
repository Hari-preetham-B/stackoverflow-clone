import mongoose from "mongoose";

const loginVerificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },

    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "session",
      required: true,
    },

    deviceFingerprint: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
    },

    otpHash: {
      type: String,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    verified: {
      type: Boolean,
      default: false,
    },

    trustDevice: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

loginVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("loginVerification", loginVerificationSchema);
