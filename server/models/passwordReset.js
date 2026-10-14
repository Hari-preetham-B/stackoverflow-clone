import mongoose from "mongoose";

const passwordResetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },

    identifier: {
      type: String,
      required: true,
      trim: true,
    },

    channel: {
      type: String,
      enum: ["email", "phone"],
      required: true,
    },

    requestedAt: {
      type: Date,
      default: Date.now,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("passwordReset", passwordResetSchema);
