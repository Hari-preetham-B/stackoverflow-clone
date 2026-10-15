import express from "express";
import auth from "../middleware/auth.js";
import { createSupportRequest, getMySupportRequests, getMySupportEntitlement } from "../controller/support.js";

const router = express.Router();
router.post("/request", auth, createSupportRequest);
router.get("/requests/me", auth, getMySupportRequests);
router.get("/entitlement/me", auth, getMySupportEntitlement);
export default router;
