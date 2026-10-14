import User from "../models/auth.js";
import { getPlan } from "./subscriptionService.js";

export const canUseAdvancedSearch = (user) => getPlan(user?.subscriptionPlan).advancedSearch;

export const basicSearch = async (q) => {
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const questions = await (await import("../models/question.js")).default.find({ $or: [{ questiontitle: regex }, { questionbody: regex }, { questiontags: regex }] }).sort({ askedon: -1 }).limit(50);
  return questions;
};
