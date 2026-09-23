import express from "express";

import auth from "../middleware/auth.js";

import {
  getActiveSessions,
  revokeSession,
  getLoginActivity,
  verifyNewDevice,
} from "../controller/security.js";

const router = express.Router();

router.get("/sessions", auth, getActiveSessions);

router.delete("/sessions/:sessionId", auth, revokeSession);

router.get("/login-activity", auth, getLoginActivity);
router.post("/verify-new-device", verifyNewDevice);
export default router;
