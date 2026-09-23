import mongoose from "mongoose";

const otpschema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },

    identifier: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    channel: {
      type: String,
      enum: ["email", "phone"],
      required: true,
    },

    purpose: {
      type: String,
      enum: ["forgot_password", "language_change", "new_device"],
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

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

otpschema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("otp", otpschema);
