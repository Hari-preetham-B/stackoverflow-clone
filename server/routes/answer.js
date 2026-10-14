import express from "express";
import { Askanswer, deleteanswer, adminDeleteAnswer } from "../controller/answer.js";
import admin from "../middleware/admin.js";

import auth from "../middleware/auth.js";

const router = express.Router();

router.post("/postanswer/:id", auth, Askanswer);
router.delete("/delete/:id", auth, deleteanswer);
router.delete("/admin-delete/:id/:answerId", auth, admin, adminDeleteAnswer);

export default router;
