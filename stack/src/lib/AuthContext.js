import { useState } from "react";
import { createContext } from "react";
import axiosInstance from "./axiosinstance";
import { toast } from "react-toastify";
import { useContext } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    }

    return null;
  });

  const [loading, setloading] = useState(false);
  const [error, seterror] = useState(null);

  const [loginVerification, setLoginVerification] = useState(null);

  const Signup = async ({ name, email, password }) => {
    setloading(true);
    seterror(null);

    try {
      const res = await axiosInstance.post("/user/signup", {
        name,
        email,
        password,
      });

      const { data, token } = res.data;

      localStorage.setItem(
        "user",
        JSON.stringify({
          ...data,
          token,
        }),
      );

      setUser(data);

      toast.success("Signup Successful");

      return {
        success: true,
      };
    } catch (error) {
      const msg = error.response?.data?.message || "Signup failed";

      seterror(msg);
      toast.error(msg);

      return {
        success: false,
        message: msg,
      };
    } finally {
      setloading(false);
    }
  };

  const Login = async ({ email, password }) => {
    setloading(true);
    seterror(null);

    try {
      const res = await axiosInstance.post("/user/login", {
        email,
        password,
      });

      /*
       * Known device:
       * Backend returns data + token.
       */
      if (res.data.token) {
        const { data, token } = res.data;

        localStorage.setItem(
          "user",
          JSON.stringify({
            ...data,
            token,
          }),
        );

        setUser(data);

        toast.success("Login Successful");

        return {
          success: true,
          requiresOtp: false,
        };
      }

      /*
       * New device:
       * Backend returns verificationId and requiresOtp.
       */
      if (res.data.requiresOtp && res.data.verificationId) {
        setLoginVerification({
          verificationId: res.data.verificationId,
          email,
        });

        toast.info("New device detected. Check your email for the OTP.");

        return {
          success: true,
          requiresOtp: true,
          verificationId: res.data.verificationId,
        };
      }

      throw new Error("Unexpected login response");
    } catch (error) {
      const msg =
        error.response?.data?.message || error.message || "Login failed";

      seterror(msg);
      toast.error(msg);

      return {
        success: false,
        message: msg,
      };
    } finally {
      setloading(false);
    }
  };

  const VerifyNewDevice = async (otp) => {
    if (!loginVerification?.verificationId) {
      const msg = "No login verification request found";

      seterror(msg);
      toast.error(msg);

      return {
        success: false,
        message: msg,
      };
    }

    setloading(true);
    seterror(null);

    try {
      const res = await axiosInstance.post("/security/verify-new-device", {
        verificationId: loginVerification.verificationId,
        otp,
      });

      const { data, token } = res.data;

      localStorage.setItem(
        "user",
        JSON.stringify({
          ...data,
          token,
        }),
      );

      setUser(data);

      setLoginVerification(null);

      toast.success("Device verified. Login successful.");

      return {
        success: true,
      };
    } catch (error) {
      const msg = error.response?.data?.message || "OTP verification failed";

      seterror(msg);
      toast.error(msg);

      return {
        success: false,
        message: msg,
      };
    } finally {
      setloading(false);
    }
  };

  const CancelLoginVerification = () => {
    setLoginVerification(null);
    seterror(null);
  };

  const Logout = () => {
    setUser(null);
    setLoginVerification(null);

    localStorage.removeItem("user");

    toast.info("Logged out");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        Signup,
        Login,
        Logout,
        VerifyNewDevice,
        CancelLoginVerification,
        loginVerification,
        loading,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
