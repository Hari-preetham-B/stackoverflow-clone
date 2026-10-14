import CommunityPost from "../models/communityPost.js";
import Follow from "../models/follow.js";
import Notification from "../models/notification.js";
import Report from "../models/report.js";
import Bookmark from "../models/bookmark.js";
import User from "../models/auth.js";

const extractHashtags = (text) => [...new Set((text.match(/#[A-Za-z0-9_]+/g) || []).map((x) => x.slice(1).toLowerCase()))];

const populatePost = (query) => query.populate("authorId", "name email reputation preferredLanguage subscriptionPlan");

export const createPost = async (req, res) => {
  try {
    const { content, imageUrl, code, hashtags = [] } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "Post content is required" });
    const post = await CommunityPost.create({ authorId: req.userid, content: content.trim(), imageUrl: imageUrl || null, code: code || null, hashtags: [...new Set([...hashtags, ...extractHashtags(content)])].slice(0, 20) });
    return res.status(201).json({ data: await populatePost(CommunityPost.findById(post._id)) });
  } catch (error) { return res.status(500).json({ message: "Failed to create post" }); }
};

export const getFeed = async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const follows = await Follow.find({ followerId: req.userid }).select("followingId");
  const ids = [req.userid, ...follows.map((f) => f.followingId)];
  const filter = follows.length ? { isDeleted: false, moderationStatus: "visible", authorId: { $in: ids } } : { isDeleted: false, moderationStatus: "visible" };
  const total = await CommunityPost.countDocuments(filter);
  const posts = await populatePost(CommunityPost.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit));
  return res.json({ data: posts, pagination: { page, limit, total, hasMore: page * limit < total } });
};

export const getTrending = async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
  const since = new Date(Date.now() - days * 86400000);
  const posts = await populatePost(CommunityPost.find({ createdAt: { $gte: since }, isDeleted: false, moderationStatus: "visible" }).sort({ createdAt: -1 }).limit(100));
  posts.sort((a, b) => ((b.likes?.length || 0) + (b.comments?.length || 0) * 2 + (b.shares || 0) * 3) - ((a.likes?.length || 0) + (a.comments?.length || 0) * 2 + (a.shares || 0) * 3));
  return res.json({ data: posts.slice(0, 30) });
};

export const updatePost = async (req, res) => {
  const post = await CommunityPost.findOne({ _id: req.params.id, authorId: req.userid, isDeleted: false });
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
  const post = await CommunityPost.findOne({ _id: req.params.id, authorId: req.userid });
  if (!post) return res.status(404).json({ message: "Post not found" });
  post.isDeleted = true;
  await post.save();
  return res.json({ message: "Post deleted" });
};

export const likePost = async (req, res) => {
  const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false });
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
  const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false });
  if (!post) return res.status(404).json({ message: "Post not found" });
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: "Comment is required" });
  post.comments.push({ userId: req.userid, text: text.trim() });
  await post.save();
  if (post.authorId.toString() !== req.userid.toString()) await Notification.create({ userId: post.authorId, actorId: req.userid, type: "comment", message: "Someone commented on your post", postId: post._id });
  return res.status(201).json({ data: post.comments[post.comments.length - 1] });
};

export const replyComment = async (req, res) => {
  const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false });
  if (!post) return res.status(404).json({ message: "Post not found" });
  const comment = post.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: "Comment not found" });
  if (!req.body.text?.trim()) return res.status(400).json({ message: "Reply is required" });
  comment.replies.push({ userId: req.userid, text: req.body.text.trim() });
  await post.save();
  return res.status(201).json({ data: comment.replies[comment.replies.length - 1] });
};

export const sharePost = async (req, res) => {
  const post = await CommunityPost.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { $inc: { shares: 1 } }, { new: true });
  if (!post) return res.status(404).json({ message: "Post not found" });
  if (post.authorId.toString() !== req.userid.toString()) await Notification.create({ userId: post.authorId, actorId: req.userid, type: "share", message: "Someone shared your post", postId: post._id });
  return res.json({ data: { shares: post.shares } });
};

export const bookmarkPost = async (req, res) => {
  const post = await CommunityPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });
  const existing = await Bookmark.findOne({ userId: req.userid, postId: post._id });
  if (existing) { await existing.deleteOne(); await CommunityPost.updateOne({ _id: post._id }, { $pull: { bookmarks: req.userid } }); return res.json({ bookmarked: false }); }
  await Bookmark.create({ userId: req.userid, postId: post._id });
  await CommunityPost.updateOne({ _id: post._id }, { $addToSet: { bookmarks: req.userid } });
  return res.json({ bookmarked: true });
};

export const followUser = async (req, res) => {
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
