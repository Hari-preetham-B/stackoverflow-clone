import { createContext, useContext, useState } from "react";
import axiosInstance from "./axiosinstance";
import { toast } from "react-toastify";

/**
 * Shape of the value exposed by AuthProvider. Data fields are intentionally
 * `any` so existing consumer code keeps compiling unchanged.
 * @typedef {Object} AuthContextValue
 * @property {any} user
 * @property {(args: any) => Promise<any>} Signup
 * @property {(args: any) => Promise<any>} Login
 * @property {() => void} Logout
 * @property {(otp: string, trustDevice?: boolean) => Promise<any>} VerifyNewDevice
 * @property {() => void} CancelLoginVerification
 * @property {any} loginVerification
 * @property {boolean} loading
 * @property {any} error
 */

/** @type {import("react").Context<AuthContextValue>} */
const AuthContext = createContext(/** @type {any} */ (null));

const readUser = () => {
  if (typeof window === "undefined") return null;
  try { const stored = localStorage.getItem("user"); return stored ? JSON.parse(stored) : null; } catch { return null; }
};

const readVerification = () => {
  if (typeof window === "undefined") return null;
  try { const stored = sessionStorage.getItem("loginVerification"); return stored ? JSON.parse(stored) : null; } catch { return null; }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loginVerification, setLoginVerification] = useState(readVerification);

  const persistUser = (data, token) => {
    const value = { ...data, token };
    localStorage.setItem("user", JSON.stringify(value));
    setUser(data);
  };

  const Signup = async ({ name, email, password, phone }) => {
    setLoading(true); setError(null);
    try {
      const res = await axiosInstance.post("/user/signup", { name, email, password, phone });
      persistUser(res.data.data, res.data.token);
      toast.success("Signup successful");
      return { success: true };
    } catch (error) {
      const msg = error.response?.data?.message || "Signup failed"; setError(msg); toast.error(msg); return { success: false, message: msg };
    } finally { setLoading(false); }
  };

  const Login = async ({ email, password }) => {
    setLoading(true); setError(null);
    // A previous browser session may have been revoked. Never let it leak into a new login attempt.
    localStorage.removeItem("user");
    sessionStorage.removeItem("loginVerification");
    setUser(null);
    setLoginVerification(null);
    try {
      const res = await axiosInstance.post("/user/login", { email, password });
      if (res.data.requiresOtp && res.data.verificationId) {
        const verification = { verificationId: String(res.data.verificationId), email };
        sessionStorage.setItem("loginVerification", JSON.stringify(verification));
        setLoginVerification(verification);
        toast.info("New device detected. Check your email for the OTP.");
        return { success: true, requiresOtp: true, verificationId: verification.verificationId };
      }
      if (!res.data.token || !res.data.data) throw new Error("Unexpected login response");
      persistUser(res.data.data, res.data.token);
      toast.success("Login successful");
      return { success: true, requiresOtp: false };
    } catch (error) {
      const msg = error.response?.data?.message || error.message || "Login failed"; setError(msg); toast.error(msg); return { success: false, message: msg };
    } finally { setLoading(false); }
  };

  const VerifyNewDevice = async (otp, trustDevice = true) => {
    const verificationId = loginVerification?.verificationId;
    if (!verificationId) return { success: false, message: "No login verification request found" };
    setLoading(true); setError(null);
    try {
      const res = await axiosInstance.post("/security/verify-new-device", { verificationId, otp, trustDevice });
      persistUser(res.data.data, res.data.token);
      sessionStorage.removeItem("loginVerification"); setLoginVerification(null);
      toast.success("Device verified. Login successful."); return { success: true };
    } catch (error) { const msg = error.response?.data?.message || "OTP verification failed"; setError(msg); toast.error(msg); return { success: false, message: msg }; }
    finally { setLoading(false); }
  };

  const CancelLoginVerification = () => { sessionStorage.removeItem("loginVerification"); setLoginVerification(null); setError(null); };
  const Logout = () => { localStorage.removeItem("user"); setUser(null); CancelLoginVerification(); toast.info("Logged out"); };

  return <AuthContext.Provider value={{ user, Signup, Login, Logout, VerifyNewDevice, CancelLoginVerification, loginVerification, loading, error }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => useContext(AuthContext);
