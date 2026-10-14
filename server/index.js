import dns from "dns";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import User from "./models/auth.js";
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

dns.setServers(["1.1.1.1"]);
const app = express();
dotenv.config();
app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));
app.use(cors());
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
const PORT = process.env.PORT || 5000;
const databaseurl = process.env.MONGODB_URL;

// ADMIN_EMAIL is the documented source of truth for the administrator (see
// .env.example). Accounts created before the `role` field existed carry no role,
// which makes every admin route reject them with 403. This reconciles the
// configured account once at startup. It is an idempotent $set scoped to that one
// email: it never inserts a user, never touches any other account and never
// changes credentials.
const syncAdminRole = async () => {
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!adminEmail) return;
  try {
    const { modifiedCount } = await User.updateMany(
      { email: adminEmail, role: { $ne: "admin" } },
      { $set: { role: "admin" } },
    );
    if (modifiedCount) console.log(`Admin role synced for the configured ADMIN_EMAIL (${modifiedCount} document)`);
  } catch (error) {
    console.error("Admin role sync skipped:", error.message);
  }
};

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
