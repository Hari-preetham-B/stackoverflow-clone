import Mainlayout from "@/layout/Mainlayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import axiosInstance from "@/lib/axiosinstance";
import { useEffect, useState } from "react";
import Script from "next/script";
import { toast } from "react-toastify";

const plans = [
  { key: "free", price: 0, features: ["1 question/day", "Basic search"] },
  { key: "bronze", price: 99, features: ["5 questions/day", "Bronze badge", "Advanced search"] },
  { key: "silver", price: 299, features: ["15 questions/day", "Silver badge", "Priority support", "Enhanced profile visibility", "Unlimited bookmarks"] },
  { key: "gold", price: 999, features: ["Unlimited questions", "Gold badge", "Highest search priority", "Featured profile", "Priority support", "Exclusive community"] },
];

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<any>(null);
  const [support, setSupport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [billingAddress, setBillingAddress] = useState("");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const load = async () => { try { const r = await axiosInstance.get("/subscription/me"); setSubscription(r.data.data); } catch {} };
  // Priority support entitlement is server-derived; this UI only renders it.
  const loadSupport = async () => { try { const r = await axiosInstance.get("/support/entitlement/me"); setSupport(r.data.data); } catch { setSupport(null); } };
  useEffect(() => { load(); loadSupport(); }, []);
  const sendSupportRequest = async () => {
    if (!supportSubject.trim() || !supportMessage.trim()) { toast.error("Subject and message are required"); return; }
    try {
      const r = await axiosInstance.post("/support/request", { subject: supportSubject, message: supportMessage });
      toast.success(r.data.message);
      setSupportSubject(""); setSupportMessage("");
      await loadSupport();
    } catch (e: any) { toast.error(e.response?.data?.message || "Could not send support request"); }
  };

  const buy = async (plan: string) => {
    if (plan === "free") return;
    setLoading(true);
    try {
      const r = await axiosInstance.post("/subscription/create-order", { plan, billingDetails: { name: subscription?.user?.name, email: subscription?.user?.email, phone: subscription?.user?.phone, address: billingAddress } });
      const order = r.data.data;
      const Razorpay = (window as any).Razorpay;
      if (!Razorpay) throw new Error("Razorpay checkout did not load");
      const checkout = new Razorpay({ key: order.keyId, amount: order.amount, currency: order.currency, name: "Stack Overflow Clone", description: `${plan} subscription`, order_id: order.orderId, prefill: { name: subscription?.user?.name, email: subscription?.user?.email, contact: subscription?.user?.phone }, handler: async (response: any) => { try { await axiosInstance.post("/subscription/verify", { orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }); toast.success("Subscription activated"); await load(); } catch (e: any) { toast.error(e.response?.data?.message || "Payment verification failed"); } } });
      checkout.open();
    } catch (e: any) { toast.error(e.response?.data?.message || e.message || "Unable to start payment"); } finally { setLoading(false); }
  };

  const downloadInvoice = async (paymentId: string) => { try { const r = await axiosInstance.get(`/subscription/invoice/${paymentId}`, { responseType: "blob" }); const url = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = url; a.download = "invoice.html"; a.click(); URL.revokeObjectURL(url); } catch { toast.error("Unable to download invoice"); } };

  return <><Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" /><Mainlayout><div className="max-w-6xl mx-auto space-y-6"><div><h1 className="text-2xl font-semibold">Premium subscription</h1><p className="text-gray-600">Choose a monthly plan. Payment activates the plan after signature verification.</p></div><div className="grid md:grid-cols-4 gap-4">{plans.map((p) => <Card key={p.key}><CardHeader><CardTitle className="capitalize">{p.key}</CardTitle><div className="text-2xl font-bold">₹{p.price}<span className="text-sm font-normal">/month</span></div></CardHeader><CardContent className="space-y-3"><ul className="text-sm space-y-2">{p.features.map((f) => <li key={f}>• {f}</li>)}</ul>{p.key !== "free" && <Button variant="orange" className="w-full" disabled={loading} onClick={() => buy(p.key)}>Subscribe</Button>}</CardContent></Card>)}</div>{subscription && <Card><CardHeader><CardTitle>Subscription dashboard</CardTitle></CardHeader><CardContent className="space-y-3"><p>Active plan: <strong>{subscription.user.subscriptionPlan}</strong></p><p>Status: <strong>{subscription.user.subscriptionStatus}</strong></p><p>Renewal: {subscription.user.subscriptionRenewalDate ? new Date(subscription.user.subscriptionRenewalDate).toLocaleDateString() : "Not applicable"}</p><div><h3 className="font-semibold mb-2">Billing details</h3><div className="grid gap-2 text-sm"><p>Name: {subscription.user.billingDetails?.name || subscription.user.name}</p><p>Email: {subscription.user.billingDetails?.email || subscription.user.email}</p><p>Phone: {subscription.user.billingDetails?.phone || subscription.user.phone || "Not provided"}</p><p>Address: {subscription.user.billingDetails?.address || "Not provided"}</p></div><div className="mt-3"><label className="text-sm font-medium">Billing address for the next payment</label><input className="mt-1 w-full border rounded px-3 py-2" value={billingAddress} onChange={e=>setBillingAddress(e.target.value)} placeholder="Address" /></div></div><div><h3 className="font-semibold mb-2">Payment history</h3>{subscription.payments.map((p: any) => <div key={p._id} className="flex justify-between border-b py-2 text-sm"><span>{p.plan} · ₹{p.amount} · {p.status}</span>{p.status === "paid" && <Button variant="outline" size="sm" onClick={() => downloadInvoice(p._id)}>Download invoice</Button>}</div>)}</div></CardContent></Card>}</div>{support && <Card className="min-w-0"><CardHeader><CardTitle className="flex flex-wrap items-center gap-2">Support{support.prioritySupport && <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Priority Support</span>}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-gray-600">{support.prioritySupport ? `Requests on the ${support.plan} plan are handled with priority.` : `Requests on the ${support.plan} plan use standard queueing. Upgrade to Silver or Gold for priority support.`}</p><div className="grid gap-2"><label className="text-sm font-medium">Subject</label><input className="border rounded px-3 py-2 w-full" value={supportSubject} onChange={e=>setSupportSubject(e.target.value)} placeholder="How can we help?" /><label className="text-sm font-medium">Message</label><textarea className="border rounded px-3 py-2 w-full" rows={3} value={supportMessage} onChange={e=>setSupportMessage(e.target.value)} placeholder="Describe your issue" /></div><Button className="bg-blue-600" onClick={sendSupportRequest}>Send request</Button></CardContent></Card>}</Mainlayout></>;
}
