import express from "express";

import {
  getallusers,
  getCurrentUser,
  Login,
  Signup,
  updateprofile,
} from "../controller/auth.js";

import auth from "../middleware/auth.js";

const router = express.Router();

router.post("/signup", Signup);

router.post("/login", Login);

router.get("/getalluser", getallusers);

router.get("/me", auth, getCurrentUser);

router.patch("/update/:id", auth, updateprofile);

export default router;
