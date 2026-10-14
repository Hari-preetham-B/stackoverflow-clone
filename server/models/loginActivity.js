import mongoose from "mongoose";

const loginActivitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "session", default: null },
    device: { type: String, default: "Unknown" },
    browser: { type: String, default: "Unknown" },
    os: { type: String, default: "Unknown" },
    ipAddress: { type: String, default: "Unknown" },
    location: { type: String, default: "Unknown" },
    event: { type: String, required: true },
    success: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export default mongoose.model("LoginActivity", loginActivitySchema);
