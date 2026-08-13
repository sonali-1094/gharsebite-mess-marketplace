import { clerkClient } from "@clerk/express";
import { DEV_ADMIN_USER_ID, isDevAdminUserId } from "./devAuth.js";

export const getSignedInEmail = async (userId) => {
  if (isDevAdminUserId(userId)) {
    return {
      user: {
        id: DEV_ADMIN_USER_ID,
        fullName: "Local Dev Admin",
        publicMetadata: { role: "admin", approvalStatus: "approved" }
      },
      email: "local-dev-admin@localhost"
    };
  }

  const user = await clerkClient.users.getUser(userId);
  const primaryEmailId = user?.primaryEmailAddressId;
  const primaryEmail = user?.emailAddresses?.find(
    (emailAddress) => emailAddress.id === primaryEmailId
  )?.emailAddress;

  return {
    user,
    email: primaryEmail?.toLowerCase() || ""
  };
};

export const parseEmailList = (value = "") =>
  value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const normalizeRole = (role = "") => {
  const normalized = String(role).toLowerCase();
  if (normalized === "shopkeeper") return "chef";
  if (["admin", "chef", "user"].includes(normalized)) return normalized;
  return "";
};

export const getStaffProfile = async (userId) => {
  const { user, email } = await getSignedInEmail(userId);
  const allowedAdminEmails = parseEmailList(process.env.ADMIN_EMAILS);
  const allowedChefEmails = [
    ...parseEmailList(process.env.CHEF_EMAILS),
    ...parseEmailList(process.env.SHOPKEEPER_EMAILS)
  ];

  const metadataRole = normalizeRole(
    user?.publicMetadata?.role ||
      user?.privateMetadata?.role ||
      user?.unsafeMetadata?.role
  );

  const role =
    allowedAdminEmails.includes(email)
      ? "admin"
      : allowedChefEmails.includes(email)
        ? "chef"
        : metadataRole || "";

  const approvalStatus =
    role === "admin" ||
    allowedAdminEmails.includes(email) ||
    allowedChefEmails.includes(email)
      ? "approved"
      : user?.publicMetadata?.approvalStatus ||
        user?.privateMetadata?.approvalStatus ||
        user?.unsafeMetadata?.approvalStatus ||
        (role === "chef" ? "pending" : "");

  return {
    user,
    email,
    role,
    approvalStatus,
    isApproved: role === "admin" || approvalStatus === "approved"
  };
};

export const requireRole = (...allowedRoles) => async (req, res, next) => {
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
    const allowAllInDev =
      allowedAdminEmails.length === 0 && allowedChefEmails.length === 0;

    const effectiveRole = allowAllInDev && !profile.role ? "admin" : profile.role;

    if (!allowedRoles.includes(effectiveRole)) {
      return res.status(403).json({ message: `${allowedRoles.join(" or ")} access only` });
    }

    if (effectiveRole === "chef" && !profile.isApproved) {
      return res.status(403).json({ message: "Chef account is pending approval" });
    }

    req.staffUser = profile.user;
    req.staffRole = effectiveRole;
    req.staffEmail = profile.email;
    req.staffProfile = profile;
    return next();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const requireChefOrAdmin = requireRole("chef", "admin");
export const requireShopkeeperOrAdmin = requireChefOrAdmin;
