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

    if (!decoded?.id) {
      return res.status(401).json({
        message: "Invalid authentication token",
      });
    }

    /*
      If the JWT contains a session ID,
      verify that session is still active.
    */
    if (decoded.sessionId) {
      const session = await Session.findOne({
        _id: decoded.sessionId,
        userId: decoded.id,
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

      req.sessionId = session._id;
    }

    req.userid = decoded.id;
    req.useremail = decoded.email;

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(401).json({
      message: "Invalid or expired authentication token",
    });
  }
};

export default auth;
