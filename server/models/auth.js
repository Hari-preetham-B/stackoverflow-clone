import mongoose from "mongoose";

const userschema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: null, trim: true },
    password: { type: String, required: true, select: false },
    about: { type: String, default: "" },
    tags: { type: [String], default: [] },
    joinDate: { type: Date, default: Date.now },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    reputation: { type: Number, default: 0, min: 0 },
    preferredLanguage: { type: String, enum: ["en", "es", "hi", "pt", "zh", "fr"], default: "en" },
    profileCompleted: { type: Boolean, default: false },
    subscriptionPlan: { type: String, enum: ["free", "bronze", "silver", "gold"], default: "free" },
    subscriptionStatus: { type: String, enum: ["active", "inactive", "pending", "cancelled", "expired", "halted"], default: "active" },
    subscriptionRenewalDate: { type: Date, default: null },
    // Moderation suspension. A suspension with no `suspendedUntil` is
    // indefinite; one with a date lapses on its own, so no scheduled job is
    // needed to lift it.
    isSuspended: { type: Boolean, default: false },
    suspendedUntil: { type: Date, default: null },
    suspensionReason: { type: String, default: null },
    billingDetails: {
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      address: { type: String, default: "" },
    },
  },
  { timestamps: true },
);
export default mongoose.model("user", userschema);
