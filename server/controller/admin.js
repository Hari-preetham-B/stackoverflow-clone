import CommunityPost from "../models/communityPost.js";
import Report from "../models/report.js";
import LoginActivity from "../models/loginActivity.js";
import User from "../models/auth.js";
import ContentReport from "../models/contentReport.js";
import question from "../models/question.js";

export const getReports = async (_req, res) => res.json({ data: await Report.find({ status: "open" }).sort({ createdAt: -1 }).populate("reporterId", "name email").populate("postId") });

export const moderateReport = async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ message: "Report not found" });
  const status = req.body.status;
  if (!["reviewed", "dismissed", "removed"].includes(status)) return res.status(400).json({ message: "Invalid report status" });
  report.status = status; report.reviewedBy = req.userid; report.reviewedAt = new Date(); await report.save();
  if (status === "removed") await CommunityPost.findByIdAndUpdate(report.postId, { moderationStatus: "removed", isDeleted: true });
  return res.json({ message: "Report updated" });
};

export const getLoginActivityAdmin = async (_req, res) => res.json({ data: await LoginActivity.find().sort({ createdAt: -1 }).limit(200).populate("userId", "name email") });

export const getUsersAdmin = async (_req, res) => res.json({ data: await User.find().select("name email role reputation subscriptionPlan subscriptionStatus createdAt") });

export const getContentReports = async (_req, res) => res.json({ data: await ContentReport.find({ status: "open" }).sort({ createdAt: -1 }).populate("reporterId", "name email").populate("questionId", "questiontitle") });

export const moderateContentReport = async (req, res) => {
  const report = await ContentReport.findById(req.params.id);
  if (!report) return res.status(404).json({ message: "Content report not found" });
  const status = req.body.status;
  if (!["reviewed", "dismissed", "removed"].includes(status)) return res.status(400).json({ message: "Invalid report status" });
  report.status = status; await report.save();
  if (status === "removed" && report.questionId) await question.findByIdAndDelete(report.questionId);
  return res.json({ message: "Content report updated" });
};
