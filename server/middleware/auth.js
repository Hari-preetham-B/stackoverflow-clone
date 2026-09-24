import jwt from "jsonwebtoken";
import Session from "../models/session.js";

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: "Authentication token missing",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.id || !decoded?.sessionId) {
      return res.status(401).json({
        message: "Invalid session authentication",
      });
    }

    const session = await Session.findOne({
      _id: decoded.sessionId,
      userId: decoded.id,
      tokenId: decoded.tokenId,
      isActive: true,
      expiresAt: {
        $gt: new Date(),
      },
    });

    if (!session) {
      return res.status(401).json({
        message: "Session expired or revoked",
      });
    }

    session.lastActive = new Date();
    await session.save();

    req.userid = decoded.id;
    req.useremail = decoded.email;
    req.sessionId = session._id;

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(401).json({
      message: "Invalid or expired authentication token",
    });
  }
};

export default auth;
