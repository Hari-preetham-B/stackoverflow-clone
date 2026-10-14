import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    plan: { type: String, enum: ["bronze", "silver", "gold"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    provider: { type: String, enum: ["razorpay", "mock"], required: true },
    orderId: { type: String, required: true, unique: true },
    paymentId: { type: String, default: null, unique: true, sparse: true },
    signature: { type: String, default: null },
    status: { type: String, enum: ["created", "paid", "failed", "refunded"], default: "created" },
    invoiceNumber: { type: String, unique: true, sparse: true },
    billingDetails: {
      name: String,
      email: String,
      phone: String,
      address: String,
    },
    paidAt: Date,
  },
  { timestamps: true },
);

export default mongoose.model("Payment", paymentSchema);
