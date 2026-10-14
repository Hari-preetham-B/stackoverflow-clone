import mongoose from "mongoose";

const replySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  text: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
});

const commentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  text: { type: String, required: true, trim: true },
  replies: { type: [replySchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

const communityPostSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    content: { type: String, required: true, trim: true, maxlength: 5000 },
    imageUrl: { type: String, default: null },
    code: { type: String, default: null },
    hashtags: { type: [String], default: [], index: true },
    likes: { type: [mongoose.Schema.Types.ObjectId], ref: "user", default: [] },
    shares: { type: Number, default: 0 },
    bookmarks: { type: [mongoose.Schema.Types.ObjectId], ref: "user", default: [] },
    comments: { type: [commentSchema], default: [] },
    isDeleted: { type: Boolean, default: false, index: true },
    moderationStatus: { type: String, enum: ["visible", "hidden", "removed"], default: "visible" },
    reportCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

communityPostSchema.index({ createdAt: -1 });
communityPostSchema.index({ hashtags: 1, createdAt: -1 });

export default mongoose.model("CommunityPost", communityPostSchema);
