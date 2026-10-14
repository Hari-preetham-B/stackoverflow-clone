import mongoose from "mongoose";
const otpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    identifier: { type: String, required: true, trim: true },
    channel: { type: String, enum: ["email", "phone", "email-fallback"], required: true },
    purpose: { type: String, enum: ["forgot_password", "language_change"], required: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    verified: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
  },
  { timestamps: true },
);
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("Otp", otpSchema);
