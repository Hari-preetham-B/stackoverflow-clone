import mongoose from "mongoose";

const reputationLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    amount: { type: Number, required: true },
    reason: { type: String, required: true },
    eventKey: { type: String, unique: true, sparse: true },
    relatedType: { type: String, default: null },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export default mongoose.model("ReputationLog", reputationLogSchema);
