const rawApiUrl =
  import.meta.env.DEV && import.meta.env.VITE_USE_REMOTE_API !== "true"
    ? "http://localhost:5000"
    : import.meta.env.VITE_API_URL || "https://food-delivary-3zmq.onrender.com";

export const API_BASE_URL = rawApiUrl.replace(/\/+$/, "");
