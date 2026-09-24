import express from "express";

import {
  getallusers,
  getCurrentUser,
  login,
  signup,
  updateprofile,
} from "../controller/auth.js";

import auth from "../middleware/auth.js";

const router = express.Router();

router.post("/signup", signup);

router.post("/login", login);

router.get("/getalluser", getallusers);

router.get("/me", auth, getCurrentUser);

router.patch("/update/:id", auth, updateprofile);

export default router;
