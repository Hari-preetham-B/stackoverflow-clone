import express from "express";
import {
  Askquestion,
  deletequestion,
  getallquestion,
  getquestion,
  votequestion,
  searchQuestions,
  acceptAnswer,
  voteAnswer,
  bookmarkQuestion,
  flagQuestion,
  listTags,
  getQuestionsByTag,
} from "../controller/question.js";

const router = express.Router();
import auth from "../middleware/auth.js";
import optionalAuth from "../middleware/optionalAuth.js";
router.post("/ask", auth, Askquestion);
router.get("/getallquestion", getallquestion);
router.get("/search", optionalAuth, searchQuestions);
// Registered before the "/:id" catch-all below so they are not shadowed by it.
router.get("/tags", listTags);
router.get("/tag/:tag", getQuestionsByTag);
router.delete("/delete/:id", auth, deletequestion);
router.patch("/vote/:id", auth, votequestion);
router.patch("/:id/answers/:answerId/accept", auth, acceptAnswer);
router.patch("/:id/answers/:answerId/vote", auth, voteAnswer);
router.post("/bookmark/:id", auth, bookmarkQuestion);
router.post("/:id/flag", auth, flagQuestion);
// Must stay LAST: "/:id" is a catch-all for the GET method and would otherwise
// shadow "/getallquestion" and "/search", which are registered above it.
router.get("/:id", getquestion);

export default router;
