import express from "express";
import auth from "../middleware/auth.js";
import { requestLanguageOtp, verifyLanguageOtp } from "../controller/language.js";
const router = express.Router();
router.post("/request", auth, requestLanguageOtp);
router.post("/verify", auth, verifyLanguageOtp);
export default router;
