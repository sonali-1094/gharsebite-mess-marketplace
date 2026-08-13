import { clerkClient } from "@clerk/express";
import { getStaffProfile, parseEmailList } from "./roleAuth.js";

export const requireAdmin = async (req, res, next) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const profile = await getStaffProfile(userId);
    const allowedAdminEmails = parseEmailList(process.env.ADMIN_EMAILS);
    const allowedChefEmails = [
      ...parseEmailList(process.env.CHEF_EMAILS),
      ...parseEmailList(process.env.SHOPKEEPER_EMAILS)
    ];
    const allowAllInDev = allowedAdminEmails.length === 0 && allowedChefEmails.length === 0;

    // If ADMIN_EMAILS is not configured, allow all signed-in users in dev.
    if (!allowAllInDev && profile.role !== "admin") {
      return res.status(403).json({ message: "Admin access only" });
    }

    req.adminUser = profile.user || await clerkClient.users.getUser(userId);
    req.staffRole = "admin";
    req.staffEmail = profile.email;
    return next();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
