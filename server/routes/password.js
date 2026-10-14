import express from "express";

import {
  requestPasswordReset,
  verifyPasswordResetOtp,
} from "../controller/password.js";
import { passwordOtpLimiter, passwordResetLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

router.post("/forgot", passwordResetLimiter, requestPasswordReset);

router.post("/verify-otp", passwordOtpLimiter, verifyPasswordResetOtp);

export default router;
