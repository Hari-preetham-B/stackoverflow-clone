import crypto from "crypto";
import useragent from "useragent";

export const getDeviceInfo = (req) => {
  const userAgentString = req.headers["user-agent"] || "";

  const agent = useragent.parse(userAgentString);

  const device = agent.device.toString() || "Unknown";
  const browser = agent.toAgent() || "Unknown";
  const os = agent.os.toString() || "Unknown";

  const ipAddress =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "Unknown";

  const location =
    req.headers["x-geo-city"] ||
    req.headers["cf-ipcity"] ||
    req.headers["x-vercel-ip-city"] ||
    "Unknown";

  // IP is deliberately NOT included in the fingerprint.
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${userAgentString}|${device}|${browser}|${os}`)
    .digest("hex");

  return {
    device,
    browser,
    os,
    ipAddress,
    location,
    fingerprint,
  };
};
