import mongoose from "mongoose";
import CommunityPost from "../models/communityPost.js";
import Follow from "../models/follow.js";
import Notification from "../models/notification.js";
import Report from "../models/report.js";
import Bookmark from "../models/bookmark.js";
import User from "../models/auth.js";
import { getPlan, refreshSubscriptionStatus } from "../services/subscriptionService.js";

const extractHashtags = (text) => [...new Set((text.match(/#[A-Za-z0-9_]+/g) || []).map((x) => x.slice(1).toLowerCase()))];

// A malformed id would otherwise raise an unhandled Mongoose CastError and
// surface as a 500. Guarded centrally so every community route that takes an id
// answers 400 consistently.
const badId = (res, ...ids) => {
  if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    res.status(400).json({ message: "Invalid post ID" });
    return true;
  }
  return false;
};

// Posts that a moderator has hidden or removed must not remain directly
// interactable by id, otherwise "remove content" only hides the row from feeds
// while likes, comments and shares still work. Author deletion is tracked by
// `isDeleted`, moderation by `moderationStatus`; both must be respected.
const VISIBLE = { isDeleted: false, moderationStatus: "visible" };

// Pagination is clamped exactly as on the main feed so both endpoints behave
// identically for a client.
const readPaging = (req) => ({
  page: Math.max(Number(req.query.page) || 1, 1),
  limit: Math.min(Math.max(Number(req.query.limit) || 10, 1), 50),
});

/**
 * Deterministic affinity score for the personalized feed.
 *
 *   score = followedAuthor      * 50
 *         + likes               * 3
 *         + comments            * 4
 *         + shares              * 6
 *         + recencyBonus
 *
 * where recencyBonus = max(0, 25 - ageInHours / 2), so a brand new post earns up
 * to 25 points and the bonus decays to zero at 50 hours.
 *
 * Every term is derived from stored data - there is no randomness, no clock
 * beyond `Date.now()` for the recency term, and no model, so the same inputs
 * always produce the same order. Ties fall back to createdAt desc and then _id
 * so pagination is stable across pages.
 */
const affinityScore = (post, { followed, now }) => {
  const ageHours = Math.max(0, (now - new Date(post.createdAt).getTime()) / 3600000);
  const recency = Math.max(0, 25 - ageHours / 2);
  return (followed ? 50 : 0) + (post.likes?.length || 0) * 3 + (post.comments?.length || 0) * 4 + (post.shares || 0) * 6 + recency;
};

// Ranking happens in memory over a bounded window rather than across the whole
// collection, so cost stays predictable while still covering a realistic feed.
const AFFINITY_WINDOW = 300;

// Public profile fields only. Author email addresses are never exposed to feed
// readers; /user/me remains the way a user sees their own address.
const populatePost = (query) => query.populate("authorId", "name reputation preferredLanguage subscriptionPlan");

export const createPost = async (req, res) => {
  try {
    const { content, imageUrl, code, hashtags = [] } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "Post content is required" });
    const post = await CommunityPost.create({ authorId: req.userid, content: content.trim(), imageUrl: imageUrl || null, code: code || null, hashtags: [...new Set([...hashtags, ...extractHashtags(content)])].slice(0, 20) });
    return res.status(201).json({ data: await populatePost(CommunityPost.findById(post._id)) });
  } catch (error) { return res.status(500).json({ message: "Failed to create post" }); }
};

export const getFeed = async (req, res) => {
  const { page, limit } = readPaging(req);
  const follows = await Follow.find({ followerId: req.userid }).select("followingId");
  const followedIds = new Set(follows.map((f) => f.followingId.toString()));
  const ids = [req.userid, ...follows.map((f) => f.followingId)];
  // Posts the viewer follows are always eligible; otherwise fall back to the
  // whole visible feed, exactly as before, so a new user still sees content.
  const filter = followedIds.size ? { ...VISIBLE, authorId: { $in: ids } } : { ...VISIBLE };
  const total = await CommunityPost.countDocuments(filter);

  const candidates = await CommunityPost.find(filter).sort({ createdAt: -1 }).limit(AFFINITY_WINDOW).lean();
  const now = Date.now();
  const ranked = candidates
    .map((post) => ({ post, score: affinityScore(post, { followed: followedIds.has(post.authorId.toString()), now }) }))
    .sort((a, b) => b.score - a.score || new Date(b.post.createdAt) - new Date(a.post.createdAt) || String(a.post._id).localeCompare(String(b.post._id)))
    .map((entry) => entry.post);

  // Pagination is applied after ranking so page 2 continues the same ordering.
  const slice = ranked.slice((page - 1) * limit, page * limit);
  const posts = await populatePost(CommunityPost.find({ _id: { $in: slice.map((p) => p._id) } }));
  const byId = new Map(posts.map((p) => [String(p._id), p]));
  const ordered = slice.map((p) => byId.get(String(p._id))).filter(Boolean);
  return res.json({ data: ordered, pagination: { page, limit, total, hasMore: page * limit < total } });
};

export const getPostsByHashtag = async (req, res) => {
  const tag = String(req.params.tag || "").trim().replace(/^#/, "").toLowerCase();
  if (!tag) return res.status(400).json({ message: "A hashtag is required" });
  const { page, limit } = readPaging(req);
  // Tags are stored lowercase, so a lowercase query is all that is needed. The
  // stored array is matched exactly - no regex, so a partial or injected
  // pattern cannot widen the result set.
  const filter = { ...VISIBLE, hashtags: tag };
  const total = await CommunityPost.countDocuments(filter);
  const posts = await populatePost(CommunityPost.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit));
  return res.json({ data: posts, hashtag: tag, pagination: { page, limit, total, hasMore: page * limit < total } });
};

export const getTrending = async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
  const since = new Date(Date.now() - days * 86400000);
  const posts = await populatePost(CommunityPost.find({ createdAt: { $gte: since }, isDeleted: false, moderationStatus: "visible" }).sort({ createdAt: -1 }).limit(100));
  posts.sort((a, b) => ((b.likes?.length || 0) + (b.comments?.length || 0) * 2 + (b.shares || 0) * 3) - ((a.likes?.length || 0) + (a.comments?.length || 0) * 2 + (a.shares || 0) * 3));
  return res.json({ data: posts.slice(0, 30) });
};

export const updatePost = async (req, res) => {
  if (badId(res, req.params.id)) return;
  const post = await CommunityPost.findOne({ _id: req.params.id, authorId: req.userid, ...VISIBLE });
  if (!post) return res.status(404).json({ message: "Post not found" });
  const { content, imageUrl, code } = req.body;
  if (content !== undefined) post.content = content.trim();
  if (imageUrl !== undefined) post.imageUrl = imageUrl || null;
  if (code !== undefined) post.code = code || null;
  post.hashtags = extractHashtags(post.content);
  await post.save();
  return res.json({ data: await populatePost(CommunityPost.findById(post._id)) });
};

export const deletePost = async (req, res) => {
  if (badId(res, req.params.id)) return;
  const post = await CommunityPost.findOne({ _id: req.params.id, authorId: req.userid });
  if (!post) return res.status(404).json({ message: "Post not found" });
  post.isDeleted = true;
  await post.save();
  return res.json({ message: "Post deleted" });
};

export const likePost = async (req, res) => {
  if (badId(res, req.params.id)) return;
  const post = await CommunityPost.findOne({ _id: req.params.id, ...VISIBLE });
  if (!post) return res.status(404).json({ message: "Post not found" });
  const index = post.likes.findIndex((id) => id.toString() === req.userid.toString());
  if (index === -1) {
    post.likes.push(req.userid);
    if (post.authorId.toString() !== req.userid.toString()) await Notification.create({ userId: post.authorId, actorId: req.userid, type: "like", message: "Someone liked your post", postId: post._id });
  } else post.likes.splice(index, 1);
  await post.save();
  return res.json({ data: { liked: index === -1, likes: post.likes.length } });
};

export const commentPost = async (req, res) => {
  if (badId(res, req.params.id)) return;
  const post = await CommunityPost.findOne({ _id: req.params.id, ...VISIBLE });
  if (!post) return res.status(404).json({ message: "Post not found" });
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: "Comment is required" });
  post.comments.push({ userId: req.userid, text: text.trim() });
  await post.save();
  if (post.authorId.toString() !== req.userid.toString()) await Notification.create({ userId: post.authorId, actorId: req.userid, type: "comment", message: "Someone commented on your post", postId: post._id });
  return res.status(201).json({ data: post.comments[post.comments.length - 1] });
};

export const replyComment = async (req, res) => {
  if (badId(res, req.params.id, req.params.commentId)) return;
  const post = await CommunityPost.findOne({ _id: req.params.id, ...VISIBLE });
  if (!post) return res.status(404).json({ message: "Post not found" });
  const comment = post.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: "Comment not found" });
  if (!req.body.text?.trim()) return res.status(400).json({ message: "Reply is required" });
  comment.replies.push({ userId: req.userid, text: req.body.text.trim() });
  await post.save();
  return res.status(201).json({ data: comment.replies[comment.replies.length - 1] });
};

export const sharePost = async (req, res) => {
  if (badId(res, req.params.id)) return;
  const post = await CommunityPost.findOneAndUpdate({ _id: req.params.id, ...VISIBLE }, { $inc: { shares: 1 } }, { new: true });
  if (!post) return res.status(404).json({ message: "Post not found" });
  if (post.authorId.toString() !== req.userid.toString()) await Notification.create({ userId: post.authorId, actorId: req.userid, type: "share", message: "Someone shared your post", postId: post._id });
  return res.json({ data: { shares: post.shares } });
};

export const bookmarkPost = async (req, res) => {
  if (badId(res, req.params.id)) return;
  const post = await CommunityPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });
  const existing = await Bookmark.findOne({ userId: req.userid, postId: post._id });
  if (existing) { await existing.deleteOne(); await CommunityPost.updateOne({ _id: post._id }, { $pull: { bookmarks: req.userid } }); return res.json({ bookmarked: false }); }
  const currentUser = await User.findById(req.userid).select("subscriptionPlan");
  await refreshSubscriptionStatus(currentUser);
  const plan = getPlan(currentUser?.subscriptionPlan);
  if (plan.bookmarkLimit !== null) {
    const used = await Bookmark.countDocuments({ userId: req.userid });
    if (used >= plan.bookmarkLimit) return res.status(403).json({ message: `Bookmark limit reached for ${plan.name} plan. Upgrade your subscription for unlimited bookmarks.`, limit: plan.bookmarkLimit });
  }
  await Bookmark.create({ userId: req.userid, postId: post._id });
  await CommunityPost.updateOne({ _id: post._id }, { $addToSet: { bookmarks: req.userid } });
  return res.json({ bookmarked: true });
};

export const followUser = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.userId)) return res.status(400).json({ message: "Invalid user ID" });
  if (req.params.userId === req.userid.toString()) return res.status(400).json({ message: "You cannot follow yourself" });
  const target = await User.findById(req.params.userId);
  if (!target) return res.status(404).json({ message: "User not found" });
  const existing = await Follow.findOne({ followerId: req.userid, followingId: target._id });
  if (existing) { await existing.deleteOne(); return res.json({ following: false }); }
  await Follow.create({ followerId: req.userid, followingId: target._id });
  await Notification.create({ userId: target._id, actorId: req.userid, type: "follow", message: "Someone followed you" });
  return res.json({ following: true });
};

export const reportPost = async (req, res) => {
  if (badId(res, req.params.id)) return;
  const post = await CommunityPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });
  try { await Report.create({ reporterId: req.userid, postId: post._id, reason: req.body.reason || "Reported by user" }); } catch (error) { return res.status(409).json({ message: "You already reported this post" }); }
  await CommunityPost.updateOne({ _id: post._id }, { $inc: { reportCount: 1 } });
  return res.status(201).json({ message: "Post reported" });
};

export const getNotifications = async (req, res) => res.json({ data: await Notification.find({ userId: req.userid }).sort({ createdAt: -1 }).limit(50).populate("actorId", "name") });

export const moderatePost = async (req, res) => {
  const { status } = req.body;
  if (!["visible", "hidden", "removed"].includes(status)) return res.status(400).json({ message: "Invalid moderation status" });
  if (badId(res, req.params.id)) return;
  const post = await CommunityPost.findByIdAndUpdate(req.params.id, { moderationStatus: status }, { new: true });
  if (!post) return res.status(404).json({ message: "Post not found" });
  return res.json({ data: post });
};

export const getReportedPosts = async (_req, res) => res.json({ data: await Report.find({ status: "open" }).sort({ createdAt: -1 }).populate("reporterId", "name email").populate("postId") });

export const getExclusiveFeed = async (req, res) => {
  const user = await User.findById(req.userid).select("subscriptionPlan");
  if (user?.subscriptionPlan !== "gold") return res.status(403).json({ message: "Gold subscription required for the exclusive community" });
  const posts = await populatePost(CommunityPost.find({ moderationStatus: "visible", isDeleted: false }).sort({ createdAt: -1 }).limit(50));
  return res.json({ data: posts });
};
