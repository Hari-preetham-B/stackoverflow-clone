import crypto from "crypto";
import { UAParser } from "ua-parser-js";

export const getDeviceInfo = (req) => {
  const userAgentString = req.headers["user-agent"] || "";

  const parser = new UAParser();
  parser.setUA(userAgentString);
  const result = parser.getResult();

  const device = result.device.type
    ? `${result.device.vendor || ""} ${result.device.model || ""} ${result.device.type}`.trim() || "Unknown"
    : "Unknown";
  const browser = result.browser.name
    ? `${result.browser.name} ${result.browser.version || ""}`.trim()
    : "Unknown";
  const os = result.os.name
    ? `${result.os.name} ${result.os.version || ""}`.trim()
    : "Unknown";

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
