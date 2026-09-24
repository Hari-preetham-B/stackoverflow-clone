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
import { useAuth } from "@/lib/AuthContext";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

const VerifyDevice = () => {
  const router = useRouter();

  const {
    VerifyNewDevice,
    CancelLoginVerification,
    loginVerification,
    loading,
  } = useAuth();

  const [otp, setOtp] = useState("");

  useEffect(() => {
    if (!loginVerification?.verificationId) {
      router.replace("/auth");
    }
  }, [loginVerification, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otp || otp.length !== 6) {
      return;
    }

    const result = await VerifyNewDevice(otp);

    if (result?.success) {
      router.push("/");
    }
  };

  const handleCancel = () => {
    CancelLoginVerification();
    router.push("/auth");
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

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-xl lg:text-2xl">
                Verify your device
              </CardTitle>

              <CardDescription>
                We detected a new device. Enter the 6-digit OTP sent to your
                email.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
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

              {loginVerification?.email && (
                <p className="text-sm text-gray-500 text-center">
                  OTP sent to {loginVerification.email}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full bg-blue-600 hover:bg-blue-700 text-sm"
              >
                {loading ? "Verifying..." : "Verify device"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={loading}
                className="w-full"
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
};

export default VerifyDevice;
