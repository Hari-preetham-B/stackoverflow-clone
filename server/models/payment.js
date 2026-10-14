import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    plan: { type: String, enum: ["bronze", "silver", "gold"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    provider: { type: String, enum: ["razorpay", "mock"], required: true },
    orderId: { type: String, required: true, unique: true },
    // Index definition for paymentId lives at the schema level (below).
    paymentId: { type: String, default: null },
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

// Uniqueness applies only to documents that actually carry a Razorpay payment id.
// `unique: true, sparse: true` is NOT sufficient: `sparse` only skips documents
// where the field is entirely absent, and `default: null` writes an explicit null,
// which a sparse index still indexes. That made a second unpaid order fail with
// E11000 (index paymentId_1, dup key { paymentId: null }) before it could ever be
// completed. This partial index excludes null/absent values from the index, so any
// number of pending orders may coexist while two documents sharing a real Razorpay
// payment id are still rejected.
//
// NOTE: partialFilterExpression must be declared here at schema level. Mongoose
// silently ignores it when supplied as a path-level option.
paymentSchema.index(
  { paymentId: 1 },
  {
    unique: true,
    partialFilterExpression: { paymentId: { $type: "string" } },
  },
);

export default mongoose.model("Payment", paymentSchema);
