import mongoose from "mongoose";
const schema = new mongoose.Schema({ reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true }, questionId: { type: mongoose.Schema.Types.ObjectId, ref: "question", default: null }, reason: { type: String, required: true, maxlength: 500 }, status: { type: String, enum: ["open", "reviewed", "dismissed", "removed"], default: "open" } }, { timestamps: true });
schema.index({ reporterId: 1, questionId: 1 }, { unique: true, partialFilterExpression: { questionId: { $type: "objectId" } } });
export default mongoose.model("ContentReport", schema);
