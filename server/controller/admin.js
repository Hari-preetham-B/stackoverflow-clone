import CommunityPost from "../models/communityPost.js";
import Report from "../models/report.js";
import LoginActivity from "../models/loginActivity.js";
import User from "../models/auth.js";
import ContentReport from "../models/contentReport.js";
import question from "../models/question.js";
import { awardReputation } from "../services/reputationService.js";

export const getReports = async (_req, res) => res.json({ data: await Report.find({ status: "open" }).sort({ createdAt: -1 }).populate("reporterId", "name email").populate("postId") });

export const moderateReport = async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ message: "Report not found" });
  const status = req.body.status;
  if (!["reviewed", "dismissed", "removed"].includes(status)) return res.status(400).json({ message: "Invalid report status" });
  report.status = status; report.reviewedBy = req.userid; report.reviewedAt = new Date(); await report.save();
  if (status === "removed") {
    const removed = await CommunityPost.findByIdAndUpdate(report.postId, { moderationStatus: "removed", isDeleted: true }, { new: true });
    // -10 for admin removal. The unique eventKey makes this safe to retry: a
    // second moderation of the same report can never award the penalty twice.
    if (removed?.authorId) {
      await awardReputation({
        userId: removed.authorId,
        amount: -10,
        reason: "Admin removed community post",
        eventKey: `communitypost:${removed._id}:admin-remove`,
        relatedType: "communityPost",
        relatedId: removed._id,
        actorId: req.userid,
      });
    }
  }
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
  if (status === "removed" && report.questionId) {
    const removed = await question.findByIdAndDelete(report.questionId);
    // Same rule and same idempotency guarantee as community moderation. If the
    // question is already gone, findByIdAndDelete returns null and no penalty is
    // awarded, so a retried moderation is naturally safe.
    if (removed?.userid) {
      await awardReputation({
        userId: removed.userid,
        amount: -10,
        reason: "Admin removed question",
        eventKey: `question:${removed._id}:admin-remove`,
        relatedType: "question",
        relatedId: removed._id,
        actorId: req.userid,
      });
    }
  }
  return res.json({ message: "Content report updated" });
};
