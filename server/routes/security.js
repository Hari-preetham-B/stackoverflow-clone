import express from "express";

import auth from "../middleware/auth.js";

import {
  getActiveSessions,
  revokeSession,
  getLoginActivity,
  verifyNewDevice,
  getTrustedDevices,
  revokeTrustedDevice,
} from "../controller/security.js";

const router = express.Router();

router.get("/sessions", auth, getActiveSessions);

router.delete("/sessions/:sessionId", auth, revokeSession);

router.get("/login-activity", auth, getLoginActivity);
router.get("/trusted-devices", auth, getTrustedDevices);
router.delete("/trusted-devices/:deviceId", auth, revokeTrustedDevice);
router.post("/verify-new-device", verifyNewDevice);
export default router;
