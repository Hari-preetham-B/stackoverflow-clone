import crypto from "crypto";
import Payment from "../models/payment.js";
import User from "../models/auth.js";
import Notification from "../models/notification.js";
import { sendEmail } from "./emailService.js";

// bookmarkLimit is null for every plan: the assignment only requires
// "unlimited bookmarks" for Silver, and specifies no numeric cap for Free or
// Bronze, so no cap is invented here. A limit can still be set per plan and the
// bookmark endpoints already enforce it server-side if one is added.
export const PLANS = {
  free: { price: 0, dailyQuestions: 1, badge: null, advancedSearch: false, priority: 0, name: "Free", prioritySupport: false, featuredProfile: false, enhancedProfileVisibility: false, exclusiveCommunity: false, bookmarkLimit: null },
  bronze: { price: 99, dailyQuestions: 5, badge: "Bronze", advancedSearch: true, priority: 1, name: "Bronze", prioritySupport: false, featuredProfile: false, enhancedProfileVisibility: false, exclusiveCommunity: false, bookmarkLimit: null },
  silver: { price: 299, dailyQuestions: 15, badge: "Silver", advancedSearch: true, priority: 2, name: "Silver", prioritySupport: true, featuredProfile: false, enhancedProfileVisibility: true, exclusiveCommunity: false, bookmarkLimit: null },
  gold: { price: 999, dailyQuestions: null, badge: "Gold", advancedSearch: true, priority: 3, name: "Gold", prioritySupport: true, featuredProfile: true, enhancedProfileVisibility: true, exclusiveCommunity: true, bookmarkLimit: null },
};

export const getPlan = (plan) => PLANS[plan] || PLANS.free;

/**
 * Server-authoritative entitlement view for a plan. Benefits that have no
 * dedicated feature surface (priority support, featured profile, exclusive
 * community) are surfaced here as explicit metadata rather than being left as
 * frontend-only strings, so the client never has to decide entitlement itself.
 */
export const getEntitlements = (plan) => {
  const config = getPlan(plan);
  return {
    plan: config.name,
    badge: config.badge,
    dailyQuestions: config.dailyQuestions,
    advancedSearch: config.advancedSearch,
    searchPriority: config.priority,
    bookmarkLimit: config.bookmarkLimit,
    unlimitedBookmarks: config.bookmarkLimit === null,
    prioritySupport: config.prioritySupport,
    featuredProfile: config.featuredProfile,
    enhancedProfileVisibility: config.enhancedProfileVisibility,
    exclusiveCommunity: config.exclusiveCommunity,
  };
};

const razorpayRequest = async (path, options = {}) => {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) throw new Error("Razorpay is not configured");
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.description || "Razorpay request failed");
  return body;
};

export const createPaymentOrder = async ({ user, plan, billingDetails }) => {
  const config = getPlan(plan);
  if (!config.price) throw new Error("Invalid paid plan");
  const receipt = `sub_${user._id}_${Date.now()}`;
  const order = await razorpayRequest("/orders", { method: "POST", body: JSON.stringify({ amount: config.price * 100, currency: "INR", receipt, notes: { userId: user._id.toString(), plan } }) });
  const payment = await Payment.create({ userId: user._id, plan, amount: config.price, provider: "razorpay", orderId: order.id, billingDetails: { ...billingDetails, email: billingDetails?.email || user.email } });
  return { order, payment, keyId: process.env.RAZORPAY_KEY_ID };
};

export const verifyPayment = async ({ user, orderId, paymentId, signature }, deps = {}) => {
  const PaymentModel = deps.Payment ?? Payment;
  const UserModel = deps.User ?? User;
  const NotificationModel = deps.Notification ?? Notification;
  const sendConfirmationEmail = deps.sendEmail ?? sendEmail;

  const payment = await PaymentModel.findOne({ orderId, userId: user._id });
  if (!payment) throw new Error("Payment order not found");
  // Replay guard. The HMAC below only covers "orderId|paymentId", and neither
  // value changes after checkout, so an otherwise-valid signature stays valid
  // forever. Without this check the same proof can be resubmitted to mint extra
  // invoices, reset the renewal date, and trigger extra notifications and
  // confirmation emails. Runs before the HMAC so a replay never reaches the
  // mutation path at all.
  if (payment.status === "paid") throw new Error("Payment already verified");
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature || "");
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) throw new Error("Invalid payment signature");
  const invoiceNumber = `INV-${new Date().getFullYear()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  payment.paymentId = paymentId;
  payment.signature = signature;
  payment.status = "paid";
  payment.invoiceNumber = invoiceNumber;
  payment.paidAt = new Date();
  await payment.save();
  const renewal = new Date();
  renewal.setMonth(renewal.getMonth() + 1);
  await UserModel.findByIdAndUpdate(user._id, { subscriptionPlan: payment.plan, subscriptionStatus: "active", subscriptionRenewalDate: renewal, billingDetails: payment.billingDetails });
  await NotificationModel.create({ userId: user._id, type: "payment", message: `Your ${getPlan(payment.plan).name} subscription is active until ${renewal.toLocaleDateString()}.` });
  await sendConfirmationEmail({ to: user.email, subject: `Subscription payment confirmed - ${invoiceNumber}`, text: `Payment received for ${getPlan(payment.plan).name}. Invoice: ${invoiceNumber}. Renewal: ${renewal.toISOString()}.` });
  return { payment, renewal };
};

export const refreshSubscriptionStatus = async (user) => {
  if (user?.subscriptionPlan !== "free" && user?.subscriptionRenewalDate && user.subscriptionRenewalDate <= new Date() && user.subscriptionStatus === "active") {
    user.subscriptionStatus = "expired";
    user.subscriptionPlan = "free";
    await user.save();
  }
  return user;
};
