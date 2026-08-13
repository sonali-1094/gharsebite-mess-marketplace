import express from "express";
import { clerkClient } from "@clerk/express";
import Food from "../models/Food.js";
import Order from "../models/Order.js";
import Mess from "../models/Mess.js";
import Menu from "../models/Menu.js";
import { requireClerkAuth } from "../middleware/clerkAuth.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { getStaffProfile, parseEmailList } from "../middleware/roleAuth.js";
import { isDbConnected } from "../middleware/requireDbConnection.js";
import { isDevAdminUserId } from "../middleware/devAuth.js";
import { getLocalOrders } from "../utils/localOrders.js";

const router = express.Router();

const getPrimaryEmail = (user) => {
  const primaryEmailId = user?.primaryEmailAddressId;
  return user?.emailAddresses?.find((email) => email.id === primaryEmailId)?.emailAddress?.toLowerCase() || "";
};

const getUserRole = (user, email) => {
  const adminEmails = parseEmailList(process.env.ADMIN_EMAILS);
  const chefEmails = [
    ...parseEmailList(process.env.CHEF_EMAILS),
    ...parseEmailList(process.env.SHOPKEEPER_EMAILS)
  ];
  const metadataRole =
    user?.publicMetadata?.role ||
    user?.privateMetadata?.role ||
    user?.unsafeMetadata?.role ||
    "";

  if (adminEmails.includes(email)) return "admin";
  if (chefEmails.includes(email)) return "chef";
  return metadataRole === "shopkeeper" ? "chef" : metadataRole;
};

const getApprovalStatus = (user, role, email) => {
  const envApprovedChef = [
    ...parseEmailList(process.env.CHEF_EMAILS),
    ...parseEmailList(process.env.SHOPKEEPER_EMAILS)
  ].includes(email);

  if (role === "admin" || envApprovedChef) return "approved";
  return user?.publicMetadata?.approvalStatus || user?.privateMetadata?.approvalStatus || "pending";
};

router.get("/me", requireClerkAuth, async (req, res) => {
  try {
    const profile = await getStaffProfile(req.auth.userId);
    const allowAllInDev =
      parseEmailList(process.env.ADMIN_EMAILS).length === 0 &&
      parseEmailList(process.env.CHEF_EMAILS).length === 0 &&
      parseEmailList(process.env.SHOPKEEPER_EMAILS).length === 0;
    const role = allowAllInDev && !profile.role ? "admin" : profile.role;
    res.json({
      id: req.auth.userId,
      email: profile.email,
      role,
      approvalStatus: profile.approvalStatus,
      isApproved: role === "admin" || profile.isApproved
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/stats", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    if (!isDbConnected()) {
      const orders = getLocalOrders();
      return res.json({
        totalOrders: orders.length,
        totalRevenue: orders
          .filter((order) => order.paymentStatus === "Paid")
          .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
        activeChefs: 0
      });
    }

    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const startWeek = new Date(startToday); startWeek.setDate(startWeek.getDate() - 6);
    const startMonth = new Date(startToday.getFullYear(), startToday.getMonth(), 1);
    const [orders, activeChefIds, messes] = await Promise.all([
      Order.find(),
      Food.distinct("chefId", { chefId: { $ne: "" } }),
      Mess.find().select("approvalStatus ownerId")
    ]);

    const grossValue = (from) => orders.filter((order) => new Date(order.createdAt) >= from && !["Cancelled", "Rejected"].includes(order.status)).reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

    res.json({
      totalOrders: orders.length,
      totalRevenue: orders
        .filter((order) => order.paymentStatus === "Paid")
        .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
      activeChefs: activeChefIds.length,
      totalMesses: messes.length,
      activeMesses: messes.filter((mess) => mess.approvalStatus === "approved").length,
      pendingMesses: messes.filter((mess) => mess.approvalStatus === "pending").length,
      suspendedMesses: messes.filter((mess) => mess.approvalStatus === "suspended").length,
      todaysOrders: orders.filter((order) => new Date(order.createdAt) >= startToday).length,
      completedOrders: orders.filter((order) => ["Completed", "Delivered"].includes(order.status)).length,
      cancelledOrders: orders.filter((order) => ["Cancelled", "Rejected"].includes(order.status)).length,
      todayGrossOrderValue: grossValue(startToday),
      weekGrossOrderValue: grossValue(startWeek),
      monthGrossOrderValue: grossValue(startMonth)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/messes", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    const query = {};
    if (req.query.status) query.approvalStatus = req.query.status;
    if (req.query.area) query.area = new RegExp(req.query.area, "i");
    if (req.query.search) query.name = new RegExp(req.query.search, "i");
    const messes = await Mess.find(query).sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 50, 100));
    res.json(messes);
  } catch { res.status(500).json({ message: "Unable to load messes." }); }
});

router.patch("/messes/:id/status", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    const status = String(req.body.status || "").toLowerCase();
    if (!["pending", "approved", "rejected", "suspended"].includes(status)) return res.status(400).json({ message: "Invalid mess status." });
    const mess = await Mess.findByIdAndUpdate(req.params.id, { approvalStatus: status }, { new: true });
    if (!mess) return res.status(404).json({ message: "Mess not found." });
    res.json(mess);
  } catch { res.status(500).json({ message: "Unable to update mess status." }); }
});

router.get("/menus", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    const query = {};
    if (req.query.mealType) query.mealType = String(req.query.mealType).toUpperCase();
    if (req.query.date) { const date = new Date(req.query.date); const next = new Date(date); next.setDate(next.getDate() + 1); query.date = { $gte: date, $lt: next }; }
    const menus = await Menu.find(query).populate("messId", "name area").sort({ date: -1, createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 100, 200));
    res.json(menus);
  } catch { res.status(500).json({ message: "Unable to load menus." }); }
});

router.patch("/menus/:id/moderate", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    const isAvailable = Boolean(req.body.isAvailable);
    const menu = await Menu.findByIdAndUpdate(req.params.id, { isAvailable }, { new: true });
    if (!menu) return res.status(404).json({ message: "Menu not found." });
    res.json(menu);
  } catch { res.status(500).json({ message: "Unable to moderate menu." }); }
});

router.get("/chefs", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    if (isDevAdminUserId(req.auth?.userId)) {
      return res.json([]);
    }

    const response = await clerkClient.users.getUserList({ limit: 100 });
    const users = response.data || [];
    const chefs = users
      .map((user) => {
        const email = getPrimaryEmail(user);
        const role = getUserRole(user, email);
        return {
          id: user.id,
          name: user.fullName || user.username || email || "Chef",
          email,
          role,
          approvalStatus: getApprovalStatus(user, role, email),
          createdAt: user.createdAt
        };
      })
      .filter((user) => user.role === "chef");

    res.json(chefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/approve-chef/:id", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    if (isDevAdminUserId(req.auth?.userId)) {
      return res.json({ message: "Chef approved in local dev mode", approvalStatus: "approved" });
    }

    const action = String(req.body.action || "approve").toLowerCase();
    const approvalStatus = action === "reject" ? "rejected" : "approved";

    const user = await clerkClient.users.getUser(req.params.id);
    await clerkClient.users.updateUserMetadata(req.params.id, {
      publicMetadata: {
        ...user.publicMetadata,
        role: "chef",
        approvalStatus
      }
    });

    res.json({ message: `Chef ${approvalStatus}`, approvalStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
