import mongoose from "mongoose";
import User from "../models/auth.js";
import SupportRequest from "../models/supportRequest.js";
import { getEntitlements } from "../services/subscriptionService.js";

/**
 * Minimal priority-support surface.
 *
 * Any signed-in member can raise a request. Whether that request is flagged as
 * priority is decided server-side from the caller's plan, so the flag can never
 * be self-asserted by the client. Only the fields a support inbox actually
 * needs are stored: who, what, when, and the priority/plan snapshot at the time
 * of the request.
 */
const view = (doc) => ({
  _id: doc._id,
  subject: doc.subject,
  message: doc.message,
  priority: doc.priority,
  plan: doc.plan,
  status: doc.status,
  createdAt: doc.createdAt,
});

export const createSupportRequest = async (req, res) => {
  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();
  if (!subject) return res.status(400).json({ message: "Subject is required" });
  if (!message) return res.status(400).json({ message: "Message is required" });
  if (subject.length > 160) return res.status(400).json({ message: "Subject is too long" });
  if (message.length > 4000) return res.status(400).json({ message: "Message is too long" });

  const user = await User.findById(req.userid).select("subscriptionPlan subscriptionStatus subscriptionRenewalDate");
  if (!user) return res.status(404).json({ message: "User not found" });
  const entitlements = getEntitlements(user.subscriptionPlan);
  const doc = await SupportRequest.create({
    userId: user._id,
    subject,
    message,
    // Server-derived, never client-supplied.
    priority: entitlements.prioritySupport === true,
    plan: entitlements.plan,
  });
  return res.status(201).json({
    message: doc.priority ? "Priority support request received" : "Support request received",
    data: view(doc),
    entitlements: { prioritySupport: entitlements.prioritySupport, plan: entitlements.plan },
  });
};

export const getMySupportRequests = async (req, res) => {
  const user = await User.findById(req.userid).select("subscriptionPlan subscriptionStatus subscriptionRenewalDate");
  if (!user) return res.status(404).json({ message: "User not found" });
  const entitlements = getEntitlements(user.subscriptionPlan);
  const requests = await SupportRequest.find({ userId: req.userid }).sort({ createdAt: -1 }).limit(50).lean();
  return res.json({
    data: requests.map(view),
    entitlements: {
      prioritySupport: entitlements.prioritySupport,
      plan: entitlements.plan,
    },
  });
};

export const getMySupportEntitlement = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.userid)) return res.status(400).json({ message: "Invalid user ID" });
  const user = await User.findById(req.userid).select("subscriptionPlan subscriptionStatus subscriptionRenewalDate");
  if (!user) return res.status(404).json({ message: "User not found" });
  const entitlements = getEntitlements(user.subscriptionPlan);
  return res.json({
    data: {
      plan: entitlements.plan,
      prioritySupport: entitlements.prioritySupport === true,
      featuredProfile: entitlements.featuredProfile === true,
      enhancedProfileVisibility: entitlements.enhancedProfileVisibility === true,
      exclusiveCommunity: entitlements.exclusiveCommunity === true,
    },
  });
};
