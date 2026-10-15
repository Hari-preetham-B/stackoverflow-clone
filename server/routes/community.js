import express from "express";
import auth from "../middleware/auth.js";
import admin from "../middleware/admin.js";
import { requireNotSuspended } from "../services/suspensionService.js";
import { createPost, getFeed, getTrending, getExclusiveFeed, updatePost, deletePost, likePost, commentPost, replyComment, sharePost, bookmarkPost, followUser, reportPost, getNotifications, moderatePost, getPostsByHashtag } from "../controller/community.js";
const router = express.Router();
// Every endpoint below except DELETE /posts/:id requires a non-suspended account.
// Deleting your own post stays available while suspended so a member can always
// clean up content they created before the suspension.
router.get("/feed", auth, getFeed);
router.get("/trending", auth, getTrending);
router.get("/exclusive", auth, getExclusiveFeed);
router.get("/notifications", auth, getNotifications);
router.get("/posts/hashtag/:tag", auth, getPostsByHashtag);
router.post("/posts", auth, requireNotSuspended, createPost);
router.patch("/posts/:id", auth, requireNotSuspended, updatePost);
router.delete("/posts/:id", auth, deletePost);
router.post("/posts/:id/like", auth, requireNotSuspended, likePost);
router.post("/posts/:id/comments", auth, requireNotSuspended, commentPost);
router.post("/posts/:id/comments/:commentId/replies", auth, requireNotSuspended, replyComment);
router.post("/posts/:id/share", auth, requireNotSuspended, sharePost);
router.post("/posts/:id/bookmark", auth, requireNotSuspended, bookmarkPost);
router.post("/users/:userId/follow", auth, requireNotSuspended, followUser);
router.post("/posts/:id/report", auth, requireNotSuspended, reportPost);
router.patch("/admin/posts/:id/moderate", auth, admin, moderatePost);
export default router;
