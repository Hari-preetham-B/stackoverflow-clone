import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "CommunityPost", required: true },
    reason: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: ["open", "reviewed", "dismissed", "removed"], default: "open" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    reviewedAt: Date,
  },
  { timestamps: true },
);
reportSchema.index({ reporterId: 1, postId: 1 }, { unique: true });
export default mongoose.model("Report", reportSchema);
