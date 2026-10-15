import mongoose from "mongoose";
import question from "../models/question.js";
import { awardReputation } from "../services/reputationService.js";

export const Askanswer = async (req, res) => {
  const { id: _id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(_id)) return res.status(400).json({ message: "question unavailable" });
  const { answerbody } = req.body;
  if (!answerbody?.trim()) return res.status(400).json({ message: "Answer is required" });
  try {
    const doc = await question.findById(_id);
    if (!doc) return res.status(404).json({ message: "question unavailable" });
    const answer = { answerbody: answerbody.trim(), useranswered: req.body.useranswered, userid: req.userid };
    doc.answer.push(answer); doc.noofanswer = doc.answer.filter((a) => !a.deleted).length; await doc.save();
    const created = doc.answer[doc.answer.length - 1];
    await awardReputation({ userId: req.userid, amount: 5, reason: "Answer posted", eventKey: `answer:${created._id}:posted`, relatedType: "answer", relatedId: created._id });
    return res.status(201).json({ data: doc });
  } catch (error) { return res.status(500).json({ message: "Failed to post answer" }); }
};

export const deleteanswer = async (req, res) => {
  const { id: questionId } = req.params;
  const { answerid } = req.body;
  if (!mongoose.Types.ObjectId.isValid(questionId) || !mongoose.Types.ObjectId.isValid(answerid)) return res.status(400).json({ message: "Invalid answer ID" });
  const doc = await question.findById(questionId);
  if (!doc) return res.status(404).json({ message: "question unavailable" });
  const answer = doc.answer.id(answerid);
  if (!answer) return res.status(404).json({ message: "answer unavailable" });
  if (answer.userid.toString() !== req.userid.toString()) return res.status(403).json({ message: "You can only delete your own answer" });
  if (answer.deleted) return res.status(400).json({ message: "Answer already deleted" });
  answer.deleted = true; doc.noofanswer = doc.answer.filter((a) => !a.deleted).length; await doc.save();
  await awardReputation({ userId: answer.userid, amount: -5, reason: "User deleted answer", eventKey: `answer:${answer._id}:user-delete`, relatedType: "answer", relatedId: answer._id });
  return res.json({ message: "Answer deleted", data: doc });
};

export const adminDeleteAnswer = async (req, res) => {
  const { id: questionId, answerId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(questionId) || !mongoose.Types.ObjectId.isValid(answerId)) return res.status(400).json({ message: "Invalid answer ID" });
  const doc = await question.findById(questionId);
  if (!doc) return res.status(404).json({ message: "question unavailable" });
  const answer = doc.answer.id(answerId);
  if (!answer || answer.deleted) return res.status(404).json({ message: "answer unavailable" });
  answer.deleted = true;
  doc.noofanswer = doc.answer.filter((a) => !a.deleted).length;
  await doc.save();
  await (await import("../services/reputationService.js")).awardReputation({ userId: answer.userid, amount: -10, reason: "Admin removed answer", eventKey: `answer:${answer._id}:admin-remove`, relatedType: "answer", relatedId: answer._id, actorId: req.userid });
  return res.json({ message: "Answer removed by admin" });
};
