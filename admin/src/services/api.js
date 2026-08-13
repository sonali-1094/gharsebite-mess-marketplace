import { API_BASE_URL } from "../config/api.js";

export const createApiClient = (getToken) => async (path, options = {}) => {
  const token = await getToken().catch(() => null);
  const devBypassHeaders = import.meta.env.DEV
    ? { "x-dev-admin-bypass": "true" }
    : {};

  if (!token && !import.meta.env.DEV) {
    throw new Error(
      "No Clerk session token found. Sign out and sign in again, then confirm admin/.env uses VITE_CLERK_PUBLISHABLE_KEY from the same Clerk app as backend CLERK_SECRET_KEY."
    );
  }

  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...devBypassHeaders,
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : {};

  if (!response.ok) {
    throw new Error(
      data.message ||
        data.error ||
        `Request failed (${response.status}) at ${url}. Check VITE_API_URL and backend routes.`
    );
  }

  return data;
};

export const getStaffProfile = (api) => api("/api/admin/me");

export const getAdminStats = (api) => api("/api/admin/stats");
export const getAdminMesses = (api, params = "") => api(`/api/admin/messes${params}`);
export const updateMessStatus = (api, messId, status) => api(`/api/admin/messes/${messId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
export const getAdminMenus = (api, params = "") => api(`/api/admin/menus${params}`);
export const moderateMenu = (api, menuId, isAvailable) => api(`/api/admin/menus/${menuId}/moderate`, { method: "PATCH", body: JSON.stringify({ isAvailable }) });

export const getChefs = (api) => api("/api/admin/chefs");

export const updateChefApproval = (api, chefId, action) =>
  api(`/api/admin/approve-chef/${chefId}`, {
    method: "PATCH",
    body: JSON.stringify({ action })
  });

export const getAllOrders = (api) => api("/api/order");

export const getChefOrders = (api) => api("/api/chef/orders");

export const getChefSummary = (api) => api("/api/chef/summary");

export const getChefFoods = (api) => api("/api/food/mine");

export const getFoods = async () => {
  const response = await fetch(`${API_BASE_URL}/api/food`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || "Failed to load foods");
  }
  return Array.isArray(data) ? data : [];
};

export const addFood = (api, payload) =>
  api("/api/food/add", {
    method: "POST",
    body: JSON.stringify(payload)
  });

export const updateFood = (api, foodId, payload) =>
  api(`/api/food/${foodId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

export const deleteFood = (api, foodId) =>
  api(`/api/food/${foodId}`, {
    method: "DELETE"
  });

export const updateOrderStatus = (api, orderId, status) =>
  api(`/api/order/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
