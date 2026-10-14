import axios from "axios";

const axiosInstance = axios.create({
  // Client-side code can only read NEXT_PUBLIC_* variables. BACKEND_URL is
  // deliberately not consulted here; it stays server-only.
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000",
  headers: { "Content-Type": "application/json" },
});

let redirecting = false;

axiosInstance.interceptors.request.use((req) => {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("user");
      const token = stored ? JSON.parse(stored).token : null;
      if (token) req.headers.Authorization = `Bearer ${token}`;
    } catch {}
  }
  return req;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== "undefined" && error.response?.status === 401) {
      const url = String(error.config?.url || "");
      const publicAuthRequest = /\/user\/(login|signup)|\/password\/(forgot|verify-otp)|\/security\/verify-new-device/.test(url);
      if (!publicAuthRequest && localStorage.getItem("user")) {
        localStorage.removeItem("user");
        sessionStorage.removeItem("loginVerification");
        if (!redirecting && !window.location.pathname.startsWith("/auth")) {
          redirecting = true;
          window.location.assign("/auth?reason=session-expired");
        }
      }
    }
    return Promise.reject(error);
  },
);

export default axiosInstance;
