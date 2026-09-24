import crypto from "crypto";
import Session from "../models/session.js";
import LoginActivity from "../models/loginActivity.js";
import TrustedDevice from "../models/trustedDevice.js";
import { getDeviceInfo } from "./deviceService.js";

export const createSession = async ({
  userId,
  req,
  isTrusted = false,
  isActive = true,
}) => {
  const deviceInfo = getDeviceInfo(req);

  const tokenId = crypto.randomBytes(32).toString("hex");

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const session = await Session.create({
    userId,
    tokenId,
    deviceFingerprint: deviceInfo.fingerprint,
    device: deviceInfo.device,
    browser: deviceInfo.browser,
    os: deviceInfo.os,
    ipAddress: deviceInfo.ipAddress,
    isTrusted,
    isActive,
    expiresAt,
  });

  return {
    session,
    deviceInfo,
  };
};

export const isKnownDevice = async ({ userId, deviceFingerprint }) => {
  const trustedDevice = await TrustedDevice.findOne({
    userId,
    deviceFingerprint,
    isActive: true,
  });

  return Boolean(trustedDevice);
};

export const createTrustedDevice = async ({ userId, deviceInfo }) => {
  const trustedDevice = await TrustedDevice.findOneAndUpdate(
    {
      userId,
      deviceFingerprint: deviceInfo.fingerprint,
    },
    {
      $set: {
        device: deviceInfo.device,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        ipAddress: deviceInfo.ipAddress,
        lastUsedAt: new Date(),
        isActive: true,
      },
      $setOnInsert: {
        userId,
        deviceFingerprint: deviceInfo.fingerprint,
        trustedAt: new Date(),
      },
    },
    {
      new: true,
      upsert: true,
    },
  );

  return trustedDevice;
};

export const updateTrustedDeviceUsage = async ({
  userId,
  deviceFingerprint,
  ipAddress,
}) => {
  return TrustedDevice.findOneAndUpdate(
    {
      userId,
      deviceFingerprint,
      isActive: true,
    },
    {
      $set: {
        lastUsedAt: new Date(),
        ipAddress,
      },
    },
    {
      new: true,
    },
  );
};

export const createLoginActivity = async ({
  userId,
  req,
  sessionId,
  event,
  success = true,
}) => {
  const deviceInfo = getDeviceInfo(req);

  return LoginActivity.create({
    userId,
    sessionId,
    event,
    success,
    device: deviceInfo.device,
    browser: deviceInfo.browser,
    os: deviceInfo.os,
    ipAddress: deviceInfo.ipAddress,
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
