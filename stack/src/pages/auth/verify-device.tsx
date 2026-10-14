import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

export default function VerifyDevice() {
  const router = useRouter();
  const { VerifyNewDevice, CancelLoginVerification, loginVerification, loading } = useAuth();
  const [otp, setOtp] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);

  useEffect(() => { if (router.isReady && !loginVerification?.verificationId) router.replace("/auth"); }, [router.isReady, router, loginVerification]);

  const submit = async (e: React.FormEvent) => { e.preventDefault(); if (otp.length !== 6) return; const result = await VerifyNewDevice(otp, trustDevice); if (result.success) router.replace("/"); };
  const cancel = () => { CancelLoginVerification(); router.replace("/auth"); };

  return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4"><div className="w-full max-w-md"><div className="text-center mb-6"><Link href="/" className="text-xl font-bold text-gray-800">stack<span className="font-normal">overflow</span></Link></div><form onSubmit={submit}><Card><CardHeader className="text-center"><CardTitle>Verify your device</CardTitle><CardDescription>Enter the 6-digit code sent to your email.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="otp">Verification code</Label><Input id="otp" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} /> Trust this device</label><Button className="w-full bg-blue-600" disabled={loading || otp.length !== 6}>{loading ? "Verifying..." : "Verify device"}</Button><Button type="button" variant="outline" className="w-full" onClick={cancel}>Cancel</Button></CardContent></Card></form></div></div>;
}
