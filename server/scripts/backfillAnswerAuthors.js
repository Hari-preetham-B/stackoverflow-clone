/**
 * Answer-author backfill - SAFE, IDEMPOTENT, MINIMAL.
 *
 * Why this exists
 * ---------------
 * `server/controller/answer.js` used to store the displayed author from
 * `req.body.useranswered` (client supplied). The demo seeder posts answers with
 * only `{ answerbody }`, so every answer it created was persisted with
 * `useranswered === undefined`. `QuestionDetail.tsx` then rendered
 * `ans.useranswered[0]`, which threw and took down the entire question page.
 *
 * The author name is now derived from the authenticated session at write time, so
 * new answers are always correct. This script repairs the answers that already
 * exist, using the authoritative `answer.userid` ownership field.
 *
 * Safety rules enforced here:
 *  - Only sets the single field `answer.<id>.useranswered`, via `arrayFilters`.
 *    No other answer field is touched: body, votes, accepted flag, deleted flag,
 *    timestamps and the containing question are all left exactly as they are.
 *  - Only touches answers whose author is currently missing/empty.
 *  - Never reads or writes the users collection for update; names are read only.
 *  - Never touches users, payments, or any other collection.
 *  - Idempotent: a second run reports 0 updates and writes nothing.
 *
 * Usage:  node scripts/backfillAnswerAuthors.js
 */
import dns from "dns";
dns.setServers(["1.1.1.1"]);

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import question from "../models/question.js";
import User from "../models/auth.js";

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log("connected");

  const questions = await question.find({});
  const users = await User.find({}, "name");
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));

  let candidates = 0;
  let unresolvable = 0;
  let updated = 0;
  const unresolvedOwners = new Set();

  for (const doc of questions) {
    for (const answer of doc.answer || []) {
      const missing = answer.useranswered === undefined || answer.useranswered === null || answer.useranswered === "";
      if (!missing) continue;
      candidates += 1;
      const name = nameById.get(String(answer.userid));
      if (!name) {
        unresolvable += 1;
        unresolvedOwners.add(String(answer.userid));
        continue;
      }
      // Narrow, single-field update scoped to this one answer by its _id.
      const res = await question.updateOne(
        { _id: doc._id },
        { $set: { "answer.$[target].useranswered": name } },
        { arrayFilters: [{ "target._id": answer._id }] },
      );
      if (res.modifiedCount === 1) updated += 1;
    }
  }

  const remaining = await question.aggregate([
    { $unwind: "$answer" },
    { $match: { $or: [{ "answer.useranswered": { $exists: false } }, { "answer.useranswered": null }, { "answer.useranswered": "" }] } },
    { $count: "n" },
  ]);

  console.log(`questions scanned        : ${questions.length}`);
  console.log(`answers missing author   : ${candidates}`);
  console.log(`answers updated          : ${updated}`);
  console.log(`unresolvable owner id    : ${unresolvable}`);
  if (unresolvedOwners.size) console.log(`  unresolved user ids     : ${[...unresolvedOwners].join(", ")}`);
  console.log(`answers still missing    : ${(remaining[0]?.n) || 0}`);

  await mongoose.disconnect();
  console.log("done");
};

run().catch((error) => {
  console.error("backfill failed:", error);
  process.exit(1);
});