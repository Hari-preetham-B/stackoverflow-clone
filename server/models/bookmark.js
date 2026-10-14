import mongoose from "mongoose";
const bookmarkSchema = new mongoose.Schema(
  { userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true }, postId: { type: mongoose.Schema.Types.ObjectId, ref: "CommunityPost", required: true } },
  { timestamps: true },
);
bookmarkSchema.index({ userId: 1, postId: 1 }, { unique: true });
export default mongoose.model("Bookmark", bookmarkSchema);
