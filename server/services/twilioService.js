import twilio from "twilio";

const getClient = () => {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) throw new Error("Twilio is not configured");
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
};

export const sendPhoneVerification = async (phone) => {
  if (!process.env.TWILIO_VERIFY_SERVICE_SID) throw new Error("Twilio Verify service is not configured");
  return getClient().verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID).verifications.create({ to: phone, channel: "sms" });
};

export const verifyPhoneCode = async (phone, code) => {
  if (!process.env.TWILIO_VERIFY_SERVICE_SID) throw new Error("Twilio Verify service is not configured");
  const result = await getClient().verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID).verificationChecks.create({ to: phone, code });
  return result.status === "approved";
};
