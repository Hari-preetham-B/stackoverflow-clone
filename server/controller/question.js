import mongoose from "mongoose";
import question from "../models/question.js";
import User from "../models/auth.js";
import { getPlan, refreshSubscriptionStatus } from "../services/subscriptionService.js";
import { awardReputation } from "../services/reputationService.js";
import QuestionBookmark from "../models/questionBookmark.js";
import ContentReport from "../models/contentReport.js";

export const Askquestion = async (req, res) => {
  try {
    const { questiontitle, questionbody, questiontags, userposted, userid } = req.body.postquestiondata || {};
    if (!questiontitle || !questionbody) return res.status(400).json({ message: "Title and body are required" });
    if (userid && userid.toString() !== req.userid.toString()) return res.status(403).json({ message: "Invalid question owner" });
    const currentUser = await User.findById(req.userid).select("subscriptionPlan subscriptionStatus subscriptionRenewalDate name");
    await refreshSubscriptionStatus(currentUser);
    const plan = getPlan(currentUser.subscriptionPlan);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const count = await question.countDocuments({ userid: req.userid, askedon: { $gte: start } });
    if (plan.dailyQuestions !== null && count >= plan.dailyQuestions) return res.status(429).json({ message: `Daily question limit reached for ${plan.name} plan`, limit: plan.dailyQuestions });
    const postques = await question.create({ questiontitle, questionbody, questiontags: Array.isArray(questiontags) ? questiontags.slice(0, 5) : [], userposted: currentUser.name || userposted, userid: req.userid });
    await awardReputation({ userId: req.userid, amount: 2, reason: "Question posted" , eventKey: `question:${postques._id}:post`, relatedType: "question", relatedId: postques._id });
    return res.status(201).json({ data: postques });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Failed to post question" }); }
};

export const getallquestion = async (req, res) => {
  try {
    const allquestion = await question.find().sort({ askedon: -1 });
    res.status(200).json({ data: allquestion });
  } catch (error) { res.status(500).json({ message: "Failed to load questions" }); }
};

export const searchQuestions = async (req, res) => {
  const q = String(req.query.q || "").trim();
  const advanced = String(req.query.advanced || "false") === "true";
  if (!q) return res.status(400).json({ message: "Search query is required" });
  if (advanced) {
    if (!req.userid) return res.status(401).json({ message: "Login required for advanced search" });
    const current = await User.findById(req.userid).select("subscriptionPlan subscriptionStatus subscriptionRenewalDate");
    await refreshSubscriptionStatus(current);
    if (!getPlan(current?.subscriptionPlan).advancedSearch) return res.status(403).json({ message: "Advanced search requires Bronze or higher" });
  }
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const filter = { $or: [{ questiontitle: regex }, { questionbody: regex }, { questiontags: regex }] };
  if (advanced && req.query.tag) filter.questiontags = String(req.query.tag);
  if (advanced && String(req.query.unanswered) === "true") filter.noofanswer = 0;
  if (advanced && req.query.userId && mongoose.Types.ObjectId.isValid(req.query.userId)) filter.userid = req.query.userId;
  const sort = advanced && req.query.sort === "votes" ? { upvote: -1 } : { askedon: -1 };
  let results = await question.find(filter).sort(sort).limit(50).populate("userid", "subscriptionPlan");
  if (advanced) results = results.sort((a, b) => getPlan(b.userid?.subscriptionPlan).priority - getPlan(a.userid?.subscriptionPlan).priority);
  return res.json({ data: results, advanced });
};

export const deletequestion = async (req, res) => {
  const { id: _id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(_id)) return res.status(400).json({ message: "question unavailable" });
  try {
    const doc = await question.findById(_id);
    if (!doc) return res.status(404).json({ message: "question unavailable" });
    if (doc.userid.toString() !== req.userid.toString()) return res.status(403).json({ message: "You can only delete your own question" });
    await question.findByIdAndDelete(_id);
    res.status(200).json({ message: "question deleted" });
  } catch (error) { res.status(500).json({ message: "Failed to delete question" }); }
};

export const votequestion = async (req, res) => {
  const { id: _id } = req.params;
  const { value } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) return res.status(400).json({ message: "question unavailable" });
  if (!["upvote", "downvote"].includes(value)) return res.status(400).json({ message: "Invalid vote" });
  try {
    const doc = await question.findById(_id);
    if (!doc) return res.status(404).json({ message: "question unavailable" });
    const uid = req.userid.toString();
    const upindex = doc.upvote.findIndex((id) => id === uid);
    const downindex = doc.downvote.findIndex((id) => id === uid);
    if (value === "upvote") {
      if (upindex === -1) doc.upvote.push(uid); else doc.upvote.splice(upindex, 1);
      if (downindex !== -1) doc.downvote.splice(downindex, 1);
      if (upindex === -1 && doc.upvote.length === 10) await awardReputation({ userId: doc.userid, amount: 2, reason: "Question reached 10 upvotes", eventKey: `question:${doc._id}:10-upvotes`, relatedType: "question", relatedId: doc._id, actorId: req.userid });
    } else {
      if (downindex === -1) { doc.downvote.push(uid); await awardReputation({ userId: doc.userid, amount: -2, reason: "Question downvoted", eventKey: `question:${doc._id}:downvote:${uid}`, relatedType: "question", relatedId: doc._id, actorId: req.userid }); } else doc.downvote.splice(downindex, 1);
    }
    await doc.save();
    res.status(200).json({ data: doc });
  } catch (error) { res.status(500).json({ message: "Failed to update vote" }); }
};

export const acceptAnswer = async (req, res) => {
  const { id, answerId } = req.params;
  const doc = await question.findById(id);
  if (!doc) return res.status(404).json({ message: "Question not found" });
  if (doc.userid.toString() !== req.userid.toString()) return res.status(403).json({ message: "Only the question owner can accept an answer" });
  const answer = doc.answer.id(answerId);
  if (!answer || answer.deleted) return res.status(404).json({ message: "Answer not found" });
  doc.answer.forEach((a) => { a.accepted = false; });
  answer.accepted = true;
  doc.acceptedAnswerId = answer._id;
  await doc.save();
  await awardReputation({ userId: answer.userid, amount: 10, reason: "Accepted answer", eventKey: `answer:${answer._id}:accepted`, relatedType: "answer", relatedId: answer._id, actorId: req.userid });
  return res.json({ data: doc });
};

export const voteAnswer = async (req, res) => {
  const { id, answerId } = req.params;
  const { value } = req.body;
  const doc = await question.findById(id);
  if (!doc) return res.status(404).json({ message: "Question not found" });
  const answer = doc.answer.id(answerId);
  if (!answer || answer.deleted) return res.status(404).json({ message: "Answer not found" });
  const uid = req.userid.toString();
  if (value === "upvote") {
    if (!answer.upvote.includes(uid)) answer.upvote.push(uid); else answer.upvote = answer.upvote.filter((x) => x !== uid);
    answer.downvote = answer.downvote.filter((x) => x !== uid);
    if (answer.upvote.length === 5) await awardReputation({ userId: answer.userid, amount: 5, reason: "Answer reached 5 upvotes", eventKey: `answer:${answer._id}:5-upvotes`, relatedType: "answer", relatedId: answer._id, actorId: req.userid });
  } else if (value === "downvote") {
    if (!answer.downvote.includes(uid)) { answer.downvote.push(uid); await awardReputation({ userId: answer.userid, amount: -2, reason: "Answer downvoted", eventKey: `answer:${answer._id}:downvote:${uid}`, relatedType: "answer", relatedId: answer._id, actorId: req.userid }); } else answer.downvote = answer.downvote.filter((x) => x !== uid);
    answer.upvote = answer.upvote.filter((x) => x !== uid);
  } else return res.status(400).json({ message: "Invalid vote" });
  await doc.save();
  return res.json({ data: doc });
};

export const bookmarkQuestion = async (req, res) => {
  const doc = await question.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Question not found" });
  const existing = await QuestionBookmark.findOne({ userId: req.userid, questionId: doc._id });
  if (existing) { await existing.deleteOne(); return res.json({ bookmarked: false }); }
  await QuestionBookmark.create({ userId: req.userid, questionId: doc._id });
  return res.json({ bookmarked: true });
};

export const flagQuestion = async (req, res) => {
  const doc = await question.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Question not found" });
  if (!String(req.body.reason || "").trim()) return res.status(400).json({ message: "Flag reason is required" });
  try { await ContentReport.create({ reporterId: req.userid, questionId: doc._id, reason: String(req.body.reason).trim() }); }
  catch { return res.status(409).json({ message: "You already flagged this question" }); }
  return res.status(201).json({ message: "Question flagged for moderation" });
};
