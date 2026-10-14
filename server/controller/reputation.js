import mongoose from "mongoose";
import User from "../models/auth.js";
import ReputationLog from "../models/reputationLog.js";
import { awardReputation, getPrivileges, getReputationHistory } from "../services/reputationService.js";

export const getMyReputation = async (req, res) => {
  const user = await User.findById(req.userid).select("name reputation");
  return res.json({ data: { reputation: user.reputation, privileges: getPrivileges(user.reputation), history: await getReputationHistory(req.userid) } });
};

export const getPublicReputation = async (req, res) => {
  // Guard before the lookup: a malformed id would otherwise raise an
  // unhandled Mongoose CastError and surface as a 500.
  if (!mongoose.Types.ObjectId.isValid(req.params.userId)) return res.status(400).json({ message: "Invalid user ID" });
  const user = await User.findById(req.params.userId).select("name reputation");
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({ data: { user, privileges: getPrivileges(user.reputation), history: await ReputationLog.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50) } });
};

export const transferReputation = async (req, res) => {
  const amount = Number(req.body.amount);
  const receiverId = req.body.receiverId;
  const reason = String(req.body.reason || "Reputation transfer").trim();
  if (!Number.isInteger(amount) || amount <= 0 || amount > 50) return res.status(400).json({ message: "Transfer must be between 1 and 50 reputation" });
  const sender = await User.findById(req.userid);
  if (receiverId?.toString() === sender._id.toString()) return res.status(400).json({ message: "Sender and receiver must be different" });
  const receiver = await User.findById(receiverId);
  if (!receiver) return res.status(404).json({ message: "Receiver not found" });
  if (sender.reputation <= 50) return res.status(403).json({ message: "Sender must have more than 50 reputation" });
  if (sender.reputation < amount) return res.status(400).json({ message: "Insufficient reputation" });
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const sentToday = await ReputationLog.aggregate([{ $match: { actorId: sender._id, reason: "Reputation transfer", amount: { $lt: 0 }, createdAt: { $gte: since } } }, { $group: { _id: null, total: { $sum: { $abs: "$amount" } } } }]);
  const totalToday = sentToday[0]?.total || 0;
  if (totalToday + amount > 100) return res.status(400).json({ message: "Daily transfer limit is 100 reputation" });
  await awardReputation({ userId: sender._id, actorId: sender._id, amount: -amount, reason: "Reputation transfer", relatedType: "transfer", relatedId: receiver._id, metadata: { receiverId, reason } });
  await awardReputation({ userId: receiver._id, actorId: sender._id, amount, reason: "Reputation transfer received", metadata: { senderId: sender._id, reason } });
  return res.json({ message: "Reputation transferred successfully" });
};
