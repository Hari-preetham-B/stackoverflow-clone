import mongoose from "mongoose";
const schema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true }, questionId: { type: mongoose.Schema.Types.ObjectId, ref: "question", required: true } }, { timestamps: true });
schema.index({ userId: 1, questionId: 1 }, { unique: true });
export default mongoose.model("QuestionBookmark", schema);
