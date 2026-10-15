import mongoose from "mongoose";

const supportRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    // Server-derived from the caller's plan at creation time; the client never
    // sets these. Keeping the snapshot means a later plan change does not
    // rewrite the history of what was promised.
    priority: { type: Boolean, default: false },
    plan: { type: String, default: "Free" },
    status: { type: String, enum: ["open", "closed"], default: "open" },
  },
  { timestamps: true },
);

export default mongoose.model("SupportRequest", supportRequestSchema);
