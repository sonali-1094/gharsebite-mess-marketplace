import express from "express";
import { clerkClient } from "@clerk/express";
import prisma from "../lib/prisma.js";
import { requireClerkAuth } from "../middleware/clerkAuth.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { getStaffProfile, parseEmailList } from "../middleware/roleAuth.js";
import { isDevAdminUserId } from "../middleware/devAuth.js";

const router = express.Router();

const getPrimaryEmail = (user) => {
  const primaryEmailId = user?.primaryEmailAddressId;
  return user?.emailAddresses?.find((email) => email.id === primaryEmailId)?.emailAddress?.toLowerCase() || "";
};

const getUserRole = (user, email) => {
  const adminEmails = parseEmailList(process.env.ADMIN_EMAILS);
  const chefEmails = [...parseEmailList(process.env.CHEF_EMAILS), ...parseEmailList(process.env.SHOPKEEPER_EMAILS)];
  const metadataRole = user?.publicMetadata?.role || user?.privateMetadata?.role || user?.unsafeMetadata?.role || "";
  if (adminEmails.includes(email)) return "admin";
  if (chefEmails.includes(email)) return "chef";
  return metadataRole === "shopkeeper" ? "chef" : metadataRole;
};

const getApprovalStatus = (user, role, email) => {
  const envApprovedChef = [...parseEmailList(process.env.CHEF_EMAILS), ...parseEmailList(process.env.SHOPKEEPER_EMAILS)].includes(email);
  if (role === "admin" || envApprovedChef) return "approved";
  return user?.publicMetadata?.approvalStatus || user?.privateMetadata?.approvalStatus || "pending";
};

const serializeMess = ({ id, area, ...mess }) => ({ _id: id, ...mess, area: area?.name || "" });
const serializeMenuItem = ({ id, ...item }) => ({ _id: id, ...item });
const serializeMenu = ({ id, items, mess, ...menu }) => ({
  _id: id,
  ...menu,
  items: items?.map(serializeMenuItem) || [],
  ...(mess ? { messId: { _id: mess.id, name: mess.name, area: mess.area?.name || "" } } : {})
});

const calculateAdminStats = (orders, activeChefIds, messes, startToday, startWeek, startMonth) => {
  const grossValue = (from) => orders
    .filter((order) => new Date(order.createdAt) >= from && !["Cancelled", "Rejected"].includes(order.status))
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

  return {
    totalOrders: orders.length,
    totalRevenue: orders.filter((order) => order.paymentStatus === "Paid").reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
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
  };
};

router.get("/me", requireClerkAuth, async (req, res) => {
  try {
    const profile = await getStaffProfile(req.auth.userId);
    const allowAllInDev = parseEmailList(process.env.ADMIN_EMAILS).length === 0 && parseEmailList(process.env.CHEF_EMAILS).length === 0 && parseEmailList(process.env.SHOPKEEPER_EMAILS).length === 0;
    const role = allowAllInDev && !profile.role ? "admin" : profile.role;
    res.json({ id: req.auth.userId, email: profile.email, role, approvalStatus: profile.approvalStatus, isApproved: role === "admin" || profile.isApproved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/stats", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const startWeek = new Date(startToday); startWeek.setDate(startWeek.getDate() - 6);
    const startMonth = new Date(startToday.getFullYear(), startToday.getMonth(), 1);
    const [orders, activeChefIds, messes] = await Promise.all([
      prisma.order.findMany({ select: { paymentStatus: true, totalAmount: true, createdAt: true, status: true } }),
      prisma.food.findMany({ where: { chefId: { not: "" } }, distinct: ["chefId"], select: { chefId: true } }),
      prisma.mess.findMany({ select: { approvalStatus: true, ownerId: true } })
    ]);
    res.json(calculateAdminStats(orders, activeChefIds, messes, startToday, startWeek, startMonth));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/messes", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    const messes = await prisma.mess.findMany({
      where: {
        ...(req.query.status ? { approvalStatus: String(req.query.status) } : {}),
        ...(req.query.area ? { area: { name: { contains: String(req.query.area), mode: "insensitive" } } } : {}),
        ...(req.query.search ? { name: { contains: String(req.query.search), mode: "insensitive" } } : {})
      },
      include: { area: true },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(req.query.limit) || 50, 100)
    });
    res.json(messes.map(serializeMess));
  } catch {
    res.status(500).json({ message: "Unable to load messes." });
  }
});

router.patch("/messes/:id/status", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    const status = String(req.body.status || "").toLowerCase();
    if (!["pending", "approved", "rejected", "suspended"].includes(status)) return res.status(400).json({ message: "Invalid mess status." });
    const mess = await prisma.mess.update({ where: { id: req.params.id }, data: { approvalStatus: status }, include: { area: true } });
    res.json(serializeMess(mess));
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ message: "Mess not found." });
    res.status(500).json({ message: "Unable to update mess status." });
  }
});

router.get("/menus", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : null;
    const next = date ? new Date(date) : null;
    if (next) next.setDate(next.getDate() + 1);
    const menus = await prisma.menu.findMany({
      where: {
        ...(req.query.mealType ? { mealType: String(req.query.mealType).toUpperCase() } : {}),
        ...(date ? { date: { gte: date, lt: next } } : {})
      },
      include: { items: true, mess: { include: { area: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: Math.min(Number(req.query.limit) || 100, 200)
    });
    res.json(menus.map(serializeMenu));
  } catch {
    res.status(500).json({ message: "Unable to load menus." });
  }
});

router.patch("/menus/:id/moderate", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    const menu = await prisma.menu.update({ where: { id: req.params.id }, data: { isAvailable: Boolean(req.body.isAvailable) }, include: { items: true } });
    res.json(serializeMenu(menu));
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ message: "Menu not found." });
    res.status(500).json({ message: "Unable to moderate menu." });
  }
});

router.get("/chefs", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    if (isDevAdminUserId(req.auth?.userId)) return res.json([]);
    const response = await clerkClient.users.getUserList({ limit: 100 });
    const chefs = (response.data || []).map((user) => {
      const email = getPrimaryEmail(user);
      const role = getUserRole(user, email);
      return { id: user.id, name: user.fullName || user.username || email || "Chef", email, role, approvalStatus: getApprovalStatus(user, role, email), createdAt: user.createdAt };
    }).filter((user) => user.role === "chef");
    res.json(chefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/approve-chef/:id", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    if (isDevAdminUserId(req.auth?.userId)) return res.json({ message: "Chef approved in local dev mode", approvalStatus: "approved" });
    const action = String(req.body.action || "approve").toLowerCase();
    const approvalStatus = action === "reject" ? "rejected" : "approved";
    const user = await clerkClient.users.getUser(req.params.id);
    await clerkClient.users.updateUserMetadata(req.params.id, { publicMetadata: { ...user.publicMetadata, role: "chef", approvalStatus } });
    res.json({ message: `Chef ${approvalStatus}`, approvalStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export { calculateAdminStats, serializeMenu, serializeMess };
export default router;
