import User from "../models/auth.js";

const admin = async (req, res, next) => {
  try {
    const current = await User.findById(req.userid).select("role");
    if (!current || current.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    req.isAdmin = true;
    next();
  } catch (error) {
    return res.status(500).json({ message: "Authorization check failed" });
  }
};
export default admin;
