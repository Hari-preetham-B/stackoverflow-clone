import dns from "dns";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import { syncAdminRole } from "./services/adminRoleService.js";
import userroutes from "./routes/auth.js";
import questionroute from "./routes/question.js";
import answerroutes from "./routes/answer.js";
import passwordRoutes from "./routes/password.js";
import securityRoutes from "./routes/security.js";
import subscriptionRoutes from "./routes/subscription.js";
import communityRoutes from "./routes/community.js";
import reputationRoutes from "./routes/reputation.js";
import languageRoutes from "./routes/language.js";
import adminRoutes from "./routes/admin.js";
import supportRoutes from "./routes/support.js";

dns.setServers(["1.1.1.1"]);
const app = express();
dotenv.config();
app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));

// CORS: an explicit allowlist. CORS_ORIGIN accepts a comma-separated list of
// frontend origins; when it is unset we fall back to the local development
// origins so `npm run dev` keeps working out of the box. Unrestricted access is
// only granted when CORS_ORIGIN is literally "*", which must be an explicit
// operator decision. Requests without an Origin header (curl, server-to-server)
// are always allowed; a disallowed browser origin simply gets no CORS headers,
// so the browser blocks it and the API still answers non-browser clients.
const DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];
const configuredOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAnyOrigin = configuredOrigins.includes("*");
const allowedOrigins = allowAnyOrigin ? [] : configuredOrigins.length ? configuredOrigins : DEV_ORIGINS;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowAnyOrigin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }),
);

// Baseline security headers, applied without pulling in a dependency. A full
// Content-Security-Policy is deliberately not set here because it has to be
// tuned together with the Next.js and Razorpay checkout scripts.
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.get("/", (req, res) => {
  res.send("Stackoverflow clone is running perfect");
});
app.get("/health", (_req, res) => res.json({ status: "ok", service: "stackoverflow-clone-api" }));
app.use("/user", userroutes);
app.use("/question", questionroute);
app.use("/answer", answerroutes);
app.use("/password", passwordRoutes);
app.use("/security", securityRoutes);
app.use("/subscription", subscriptionRoutes);
app.use("/community", communityRoutes);
app.use("/reputation", reputationRoutes);
app.use("/language", languageRoutes);
app.use("/admin", adminRoutes);
app.use("/support", supportRoutes);
const PORT = process.env.PORT || 5000;
const databaseurl = process.env.MONGODB_URL;

mongoose
  .connect(databaseurl)
  .then(async () => {
    console.log("✅ Connected to MongoDB");
    await syncAdminRole();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
  });
