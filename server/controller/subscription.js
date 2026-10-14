import User from "../models/auth.js";
import Payment from "../models/payment.js";
import { createPaymentOrder, getPlan, PLANS, verifyPayment, refreshSubscriptionStatus } from "../services/subscriptionService.js";

export const getPlans = async (_req, res) => res.json({ data: PLANS });

export const getMySubscription = async (req, res) => {
  const user = await User.findById(req.userid).select("subscriptionPlan subscriptionStatus subscriptionRenewalDate email name phone billingDetails");
  await refreshSubscriptionStatus(user);
  const payments = await Payment.find({ userId: req.userid }).sort({ createdAt: -1 });
  return res.json({ data: { user, plan: getPlan(user.subscriptionPlan), payments } });
};

export const createOrder = async (req, res) => {
  try {
    const { plan, billingDetails } = req.body;
    if (!["bronze", "silver", "gold"].includes(plan)) return res.status(400).json({ message: "Choose a valid paid plan" });
    const user = await User.findById(req.userid);
    const result = await createPaymentOrder({ user, plan, billingDetails });
    return res.status(201).json({ data: { orderId: result.order.id, amount: result.order.amount, currency: result.order.currency, keyId: result.keyId, paymentId: result.payment._id } });
  } catch (error) {
    console.error("Create subscription order error:", error);
    return res.status(503).json({ message: error.message || "Payment service unavailable" });
  }
};

export const verifyOrder = async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    if (!orderId || !paymentId || !signature) return res.status(400).json({ message: "Payment verification fields are required" });
    const user = await User.findById(req.userid);
    const result = await verifyPayment({ user, orderId, paymentId, signature });
    return res.json({ message: "Payment successful", data: result.payment, renewalDate: result.renewal });
  } catch (error) {
    console.error("Verify subscription payment error:", error);
    return res.status(400).json({ message: error.message || "Payment verification failed" });
  }
};

export const getInvoice = async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.paymentId, userId: req.userid }).populate("userId", "name email");
  if (!payment || payment.status !== "paid") return res.status(404).json({ message: "Invoice not found" });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${payment.invoiceNumber}</title><style>body{font-family:Arial;padding:40px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:10px;text-align:left}</style></head><body><h1>Stack Overflow Clone</h1><h2>Invoice ${payment.invoiceNumber}</h2><p>Customer: ${payment.userId.name} (${payment.userId.email})</p><table><tr><th>Plan</th><th>Amount</th><th>Status</th><th>Paid</th></tr><tr><td>${payment.plan}</td><td>₹${payment.amount}</td><td>${payment.status}</td><td>${payment.paidAt?.toISOString() || ""}</td></tr></table></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${payment.invoiceNumber}.html"`);
  return res.send(html);
};
