import jwt from "jsonwebtoken";
import Session from "../models/session.js";
export default async function optionalAuth(req, _res, next) {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      const session = await Session.findOne({ _id: decoded.sessionId, userId: decoded.id, tokenId: decoded.tokenId, isActive: true, expiresAt: { $gt: new Date() } });
      if (session) req.userid = decoded.id;
    }
  } catch {}
  next();
}
