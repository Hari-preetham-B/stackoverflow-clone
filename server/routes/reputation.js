import express from "express";
import auth from "../middleware/auth.js";
import { getMyReputation, getPublicReputation, transferReputation } from "../controller/reputation.js";
const router = express.Router();
router.get("/me", auth, getMyReputation);
router.get("/:userId", getPublicReputation);
router.post("/transfer", auth, transferReputation);
export default router;
