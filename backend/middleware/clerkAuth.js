import { getAuth } from "@clerk/express";
import { DEV_ADMIN_USER_ID, isLocalDevAdminBypassRequest } from "./devAuth.js";

export const requireClerkAuth = (req, res, next) => {
  let auth;
  try {
    auth = getAuth(req);
  } catch {
    auth = null;
  }

  if (!auth?.userId) {
    if (isLocalDevAdminBypassRequest(req)) {
      req.auth = {
        userId: DEV_ADMIN_USER_ID,
        sessionId: "local-dev-session"
      };
      return next();
    }

    return res.status(401).json({ message: "Unauthorized" });
  }

  req.auth = auth;
  return next();
};
