import express from "express";
import {
  Askquestion,
  deletequestion,
  getallquestion,
  votequestion,
  searchQuestions,
  acceptAnswer,
  voteAnswer,
  bookmarkQuestion,
  flagQuestion,
} from "../controller/question.js";

const router = express.Router();
import auth from "../middleware/auth.js";
import optionalAuth from "../middleware/optionalAuth.js";
router.post("/ask", auth, Askquestion);
router.get("/getallquestion", getallquestion);
router.get("/search", optionalAuth, searchQuestions);
router.delete("/delete/:id", auth, deletequestion);
router.patch("/vote/:id", auth, votequestion);
router.patch("/:id/answers/:answerId/accept", auth, acceptAnswer);
router.patch("/:id/answers/:answerId/vote", auth, voteAnswer);
router.post("/bookmark/:id", auth, bookmarkQuestion);
router.post("/:id/flag", auth, flagQuestion);

export default router;
