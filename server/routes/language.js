import express from "express";
import auth from "../middleware/auth.js";
import { requestLanguageOtp, verifyLanguageOtp } from "../controller/language.js";
import { languageOtpLimiter } from "../middleware/rateLimit.js";
const router = express.Router();
router.post("/request", auth, requestLanguageOtp);
router.post("/verify", auth, languageOtpLimiter, verifyLanguageOtp);
export default router;
