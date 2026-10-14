import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    type: { type: String, enum: ["like", "comment", "reply", "share", "follow", "report", "payment", "system"], required: true },
    message: { type: String, required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "CommunityPost", default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export default mongoose.model("Notification", notificationSchema);
