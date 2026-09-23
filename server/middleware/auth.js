import jwt from "jsonwebtoken";

const auth = (req, res, next) => {
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

    const decodedata = jwt.verify(token, process.env.JWT_SECRET);

    if (!decodedata?.id) {
      return res.status(401).json({
        message: "Invalid authentication token",
      });
    }

    req.userid = decodedata.id;
    req.useremail = decodedata.email;

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Authentication token expired",
      });
    }

    return res.status(401).json({
      message: "Invalid authentication token",
    });
  }
};

export default auth;
