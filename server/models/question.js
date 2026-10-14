import mongoose from "mongoose";

const answerSchema = new mongoose.Schema({
  answerbody: { type: String, required: true },
  useranswered: String,
  userid: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  answeredon: { type: Date, default: Date.now },
  upvote: { type: [String], default: [] },
  downvote: { type: [String], default: [] },
  accepted: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
});

const questionSchema = new mongoose.Schema(
  {
    questiontitle: { type: String, required: true, trim: true },
    questionbody: { type: String, required: true },
    questiontags: { type: [String], required: true, default: [] },
    noofanswer: { type: Number, default: 0 },
    upvote: { type: [String], default: [] },
    downvote: { type: [String], default: [] },
    userposted: { type: String },
    userid: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    askedon: { type: Date, default: Date.now },
    acceptedAnswerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    answer: { type: [answerSchema], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model("question", questionSchema);
