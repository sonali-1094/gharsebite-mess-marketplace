export const DEV_ADMIN_USER_ID = "local-dev-admin";

export const isDevAdminUserId = (userId = "") => userId === DEV_ADMIN_USER_ID;

const isLocalValue = (value = "") =>
  value.includes("localhost") ||
  value.includes("127.0.0.1") ||
  value.includes("[::1]") ||
  value.includes("::1");

export const isLocalDevAdminBypassRequest = (req) => {
  if (process.env.NODE_ENV === "production") return false;
  if (req.get("x-dev-admin-bypass") !== "true") return false;

  const host = req.get("host") || "";
  const origin = req.get("origin") || "";
  const referer = req.get("referer") || "";

  return isLocalValue(host) || isLocalValue(origin) || isLocalValue(referer);
};
