import crypto from "crypto";
import Session from "../models/session.js";
import LoginActivity from "../models/loginActivity.js";
import TrustedDevice from "../models/trustedDevice.js";
import { getDeviceInfo } from "./deviceService.js";

export const createSession = async ({ userId, req, isTrusted = false, isActive = true }) => {
  const deviceInfo = getDeviceInfo(req);
  const tokenId = crypto.randomBytes(32).toString("hex");
  const session = await Session.create({ userId, tokenId, deviceFingerprint: deviceInfo.fingerprint, device: deviceInfo.device, browser: deviceInfo.browser, os: deviceInfo.os, ipAddress: deviceInfo.ipAddress, location: deviceInfo.location, isTrusted, isActive, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  return { session, deviceInfo };
};

export const isKnownDevice = async ({ userId, deviceFingerprint }) => Boolean(await TrustedDevice.findOne({ userId, deviceFingerprint, isActive: true, expiresAt: { $gt: new Date() } }));

export const createTrustedDevice = async ({ userId, deviceInfo }) => TrustedDevice.findOneAndUpdate({ userId, deviceFingerprint: deviceInfo.fingerprint }, { $set: { device: deviceInfo.device, browser: deviceInfo.browser, os: deviceInfo.os, ipAddress: deviceInfo.ipAddress, lastUsedAt: new Date(), isActive: true, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, $setOnInsert: { userId, deviceFingerprint: deviceInfo.fingerprint, trustedAt: new Date() } }, { new: true, upsert: true });

export const updateTrustedDeviceUsage = async ({ userId, deviceFingerprint, ipAddress }) => TrustedDevice.findOneAndUpdate({ userId, deviceFingerprint, isActive: true, expiresAt: { $gt: new Date() } }, { $set: { lastUsedAt: new Date(), ipAddress } }, { new: true });

export const createLoginActivity = async ({ userId, req, sessionId = null, event, success = true }) => { const d = getDeviceInfo(req); return LoginActivity.create({ userId, sessionId, event, success, device: d.device, browser: d.browser, os: d.os, ipAddress: d.ipAddress, location: d.location }); };
