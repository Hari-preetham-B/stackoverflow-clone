import crypto from "crypto";
import useragent from "useragent";

export const getDeviceInfo = (req) => {
  const userAgentString = req.headers["user-agent"] || "";

  const agent = useragent.parse(userAgentString);

  let deviceType = "Desktop";

  if (/tablet|ipad/i.test(userAgentString)) {
    deviceType = "Tablet";
  } else if (/mobile|iphone|android/i.test(userAgentString)) {
    deviceType = "Mobile";
  }

  const ipAddress =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "Unknown";

  const browser = `${agent.family} ${agent.major || ""}`.trim();

  const os = `${agent.os.family} ${agent.os.major || ""}`.trim();

  /*
    The fingerprint deliberately uses stable
    device/request characteristics available to
    the backend.
  */
  const fingerprintSource = [
    userAgentString,
    ipAddress,
    browser,
    os,
    deviceType,
  ].join("|");

  const deviceFingerprint = crypto
    .createHash("sha256")
    .update(fingerprintSource)
    .digest("hex");

  return {
    browser,
    os,
    deviceType,
    ipAddress,
    location: "Unknown",
    deviceFingerprint,
  };
};
