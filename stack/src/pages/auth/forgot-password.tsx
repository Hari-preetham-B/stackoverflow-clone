import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import axiosInstance from "@/lib/axiosinstance";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState } from "react";
import { toast } from "react-toastify";

const ForgotPassword = () => {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");

  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!identifier.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    setLoading(true);

    try {
      const res = await axiosInstance.post("/password/forgot", {
        identifier: identifier.trim(),
      });

      toast.success(res.data?.message || "OTP sent successfully");

      setOtpSent(true);
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to send OTP";

      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otp || otp.length !== 6) {
      toast.error("Please enter the 6-digit OTP");
      return;
    }

    setLoading(true);

    try {
      const res = await axiosInstance.post("/password/verify-otp", {
        identifier: identifier.trim(),
        otp,
      });

      toast.success(res.data?.message || "Password reset successful");

      setTimeout(() => {
        router.push("/auth");
      }, 1500);
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to verify OTP";

      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 lg:mb-8">
          <Link href="/" className="flex items-center justify-center mb-4">
            <div className="w-6 h-6 lg:w-8 lg:h-8 bg-orange-500 rounded mr-2 flex items-center justify-center">
              <div className="w-4 h-4 lg:w-6 lg:h-6 bg-white rounded-sm flex items-center justify-center">
                <div className="w-3 h-3 lg:w-4 lg:h-4 bg-orange-500 rounded-sm"></div>
              </div>
            </div>

            <span className="text-lg lg:text-xl font-bold text-gray-800">
              stack<span className="font-normal">overflow</span>
            </span>
          </Link>
        </div>

        <Card>
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-xl lg:text-2xl">
              Forgot your password?
            </CardTitle>

            <CardDescription>
              Enter your registered email address to receive a verification
              code.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="identifier">Email</Label>

                  <Input
                    id="identifier"
                    type="email"
                    placeholder="m@example.com"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    autoFocus
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? "Sending..." : "Send OTP"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="rounded-md bg-blue-50 p-3 text-sm text-gray-700">
                  An OTP has been sent to your registered email address.
                </div>

                <div className="space-y-2">
                  <Label htmlFor="otp">Verification code</Label>

                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    autoFocus
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? "Verifying..." : "Verify OTP"}
                </Button>
              </form>
            )}

            <div className="text-center text-sm">
              <Link href="/auth" className="text-blue-600 hover:underline">
                Back to login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
