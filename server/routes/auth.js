import express from "express";

import {
  getallusers,
  getCurrentUser,
  login,
  signup,
  updateprofile,
  logout,
} from "../controller/auth.js";

import auth from "../middleware/auth.js";
import { loginLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

router.post("/signup", signup);

router.post("/login", loginLimiter, login);

router.get("/getalluser", getallusers);

router.get("/me", auth, getCurrentUser);

router.patch("/update/:id", auth, updateprofile);

// Revokes the caller's own session server-side. Logging out must not merely
// forget the token in the browser - otherwise it stays usable until it expires.
router.post("/logout", auth, logout);

export default router;
