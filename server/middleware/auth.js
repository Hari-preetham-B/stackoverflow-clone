import jwt from "jsonwebtoken";
import Session from "../models/session.js";

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "Authentication required" });
    const token = header.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.id || !decoded?.sessionId || !decoded?.tokenId) return res.status(401).json({ message: "Invalid session authentication" });
    const session = await Session.findOne({ _id: decoded.sessionId, userId: decoded.id, tokenId: decoded.tokenId, isActive: true, expiresAt: { $gt: new Date() } });
    if (!session) return res.status(401).json({ message: "Session expired or revoked" });
    session.lastActive = new Date(); await session.save();
    req.userid = decoded.id; req.useremail = decoded.email; req.sessionId = session._id; req.session = session;
    return next();
  } catch (error) { return res.status(401).json({ message: "Invalid or expired authentication token" }); }
};
export default auth;
