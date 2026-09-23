import crypto from "crypto";

import Session from "../models/session.js";
import LoginActivity from "../models/loginActivity.js";
import { getDeviceInfo } from "./deviceService.js";

export const createSession = async ({
  userId,
  req,
  isTrusted = false,
  isActive = true,
}) => {
  const deviceInfo = getDeviceInfo(req);

  const tokenId = crypto.randomUUID();

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const session = await Session.create({
    userId,
    tokenId,
    browser: deviceInfo.browser,
    os: deviceInfo.os,
    deviceType: deviceInfo.deviceType,
    ipAddress: deviceInfo.ipAddress,
    location: deviceInfo.location,
    deviceFingerprint: deviceInfo.deviceFingerprint,
    isTrusted,
    isActive,
    lastActive: new Date(),
    expiresAt,
  });

  return {
    session,
    deviceInfo,
  };
};

export const isKnownDevice = async ({ userId, deviceFingerprint }) => {
  const existingSession = await Session.findOne({
    userId,
    deviceFingerprint,
    isActive: true,
    expiresAt: {
      $gt: new Date(),
    },
  });

  return Boolean(existingSession);
};

export const createLoginActivity = async ({
  userId,
  deviceInfo,
  isNewDevice,
  success = true,
}) => {
  return await LoginActivity.create({
    userId,
    browser: deviceInfo.browser,
    os: deviceInfo.os,
    deviceType: deviceInfo.deviceType,
    ipAddress: deviceInfo.ipAddress,
    location: deviceInfo.location,
    isNewDevice,
    success,
  });
};

export const revokeExpiredSessions = async () => {
  await Session.updateMany(
    {
      expiresAt: {
        $lte: new Date(),
      },
      isActive: true,
    },
    {
      $set: {
        isActive: false,
      },
    },
  );
};
