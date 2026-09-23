import express from "express";

import {
  requestPasswordReset,
  verifyPasswordResetOtp,
} from "../controller/password.js";

const router = express.Router();

router.post("/forgot", requestPasswordReset);

router.post("/verify-otp", verifyPasswordResetOtp);

export default router;
