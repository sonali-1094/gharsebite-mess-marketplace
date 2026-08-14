import express from "express";
import { clerkClient } from "@clerk/express";
import prisma from "../lib/prisma.js";
import { requireClerkAuth } from "../middleware/clerkAuth.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { requireChefOrAdmin, requireShopkeeperOrAdmin } from "../middleware/roleAuth.js";
import { DEV_ADMIN_USER_ID, isDevAdminUserId } from "../middleware/devAuth.js";
import { syncClerkUser } from "../utils/syncClerkUser.js";

const router = express.Router();

const prismaToLegacyStatus = {
  ReadyForPickup: "Ready for Pickup",
  OutForDelivery: "Out for Delivery"
};

const legacyToPrismaStatus = {
  "Ready for Pickup": "ReadyForPickup",
  "Out for Delivery": "OutForDelivery"
};

const toPrismaStatus = (status) => legacyToPrismaStatus[status] || status;
const toLegacyStatus = (status) => prismaToLegacyStatus[status] || status;

const serializeOrderItem = ({ id, menuId, menuItemId, foodId, createdAt, ...item }) => ({
  _id: id,
  ...item,
  foodId: foodId || menuId || menuItemId || ""
});

const serializeOrder = ({ id, status, messId, items, ...order }) => ({
  _id: id,
  ...order,
  messId: messId || "",
  status: toLegacyStatus(status),
  items: items.map(serializeOrderItem)
});

const ensureOrderUser = async (userId) => {
  const existingUser = await prisma.user.findUnique({ where: { id: userId } });
  if (existingUser) return existingUser;

  if (isDevAdminUserId(userId)) {
    return prisma.user.create({
      data: {
        id: DEV_ADMIN_USER_ID,
        name: "Local Dev Admin",
        email: "local-dev-admin@localhost",
        role: "admin",
        approvalStatus: "approved"
      }
    });
  }

  const clerkUser = await clerkClient.users.getUser(userId);
  return syncClerkUser(clerkUser);
};

const normalizePaymentMethod = (value) =>
  String(value).toUpperCase() === "RAZORPAY" ? "RAZORPAY" : "COD";

const getReferencedRecords = async (items, messId) => {
  const sourceIds = [...new Set(items.map((item) => String(item.foodId || "")).filter(Boolean))];
  const [foods, menus, menuItems, mess] = await Promise.all([
    prisma.food.findMany({ where: { id: { in: sourceIds } } }),
    prisma.menu.findMany({ where: { id: { in: sourceIds } } }),
    prisma.menuItem.findMany({ where: { id: { in: sourceIds } } }),
    messId ? prisma.mess.findUnique({ where: { id: messId } }) : null
  ]);

  return {
    foodById: new Map(foods.map((food) => [food.id, food])),
    menuById: new Map(menus.map((menu) => [menu.id, menu])),
    menuItemById: new Map(menuItems.map((menuItem) => [menuItem.id, menuItem])),
    mess
  };
};

const buildOrderItems = (items, foodById, menuById, menuItemById) =>
  items.map((item) => {
    const sourceId = String(item.foodId || "");
    const food = foodById.get(sourceId);
    const menu = menuById.get(sourceId);
    const menuItem = menuItemById.get(sourceId);

    return {
      foodId: food?.id || null,
      menuId: menu?.id || null,
      menuItemId: menuItem?.id || null,
      name: item.name || food?.name || menuItem?.name || (menu ? `${menu.mealType[0] + menu.mealType.slice(1).toLowerCase()} meal` : ""),
      price: item.price,
      quantity: item.quantity,
      chefId: item.chefId || food?.chefId || food?.shopkeeperId || "",
      chefName: item.chefName || food?.chefName || food?.shopName || "",
      shopkeeperId: item.shopkeeperId || food?.shopkeeperId || food?.chefId || "",
      shopName: item.shopName || food?.shopName || food?.chefName || ""
    };
  });

// Place order
router.post("/place", requireClerkAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const { items, totalAmount, address, paymentMethod = "COD", messId = "", orderType = "DELIVERY", deliveryCharge = 0 } = req.body;
    const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }

    if (!address) {
      return res.status(400).json({ message: "Delivery address is required" });
    }

    const itemMessIds = [...new Set(items.map((item) => item.messId).filter(Boolean))];
    if (itemMessIds.length > 1 || (messId && itemMessIds.length && messId !== itemMessIds[0])) {
      return res.status(400).json({ message: "One order can contain meals from one mess only." });
    }

    const resolvedMessId = messId || itemMessIds[0] || "";
    const { foodById, menuById, menuItemById, mess } = await getReferencedRecords(items, resolvedMessId);
    const orderItems = buildOrderItems(items, foodById, menuById, menuItemById);
    const primaryChefId = orderItems.find((item) => item.chefId)?.chefId || "";
    const primaryChefName = orderItems.find((item) => item.chefName)?.chefName || "";

    await ensureOrderUser(userId);
    const order = await prisma.$transaction((tx) =>
      tx.order.create({
        data: {
          userId,
          messId: mess ? mess.id : null,
          items: { create: orderItems },
          totalAmount,
          address,
          orderType: String(orderType).toUpperCase() === "PICKUP" ? "PICKUP" : "DELIVERY",
          deliveryCharge: Number(deliveryCharge || 0),
          chefId: primaryChefId,
          chefName: primaryChefName,
          shopkeeperId: primaryChefId,
          shopName: primaryChefName,
          paymentMethod: normalizedPaymentMethod,
          paymentStatus: "Pending"
        },
        include: { items: true }
      })
    );

    res.status(201).json({ message: "Order placed", order: serializeOrder(order), localOnly: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chef: see only orders assigned to the signed-in chef.
router.get("/chef", requireClerkAuth, requireChefOrAdmin, async (req, res) => {
  try {
    const chefId = req.auth?.userId;
    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { chefId },
          { shopkeeperId: chefId },
          { items: { some: { OR: [{ chefId }, { shopkeeperId: chefId }] } } }
        ]
      },
      include: { items: true },
      orderBy: { createdAt: "desc" }
    });
    res.json(orders.map(serializeOrder));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user orders
router.get("/user/:id", requireClerkAuth, async (req, res) => {
  try {
    if (req.auth?.userId !== req.params.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const orders = await prisma.order.findMany({
      where: { userId: req.params.id },
      include: { items: true }
    });
    res.json(orders.map(serializeOrder));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shopkeeper: see own accepted orders and open orders waiting for a shopkeeper.
router.get("/shopkeeper", requireClerkAuth, requireShopkeeperOrAdmin, async (req, res) => {
  try {
    const shopkeeperId = req.auth?.userId;
    const orders = await prisma.order.findMany({
      where: { OR: [{ shopkeeperId }, { shopkeeperId: "" }], status: { not: "Cancelled" } },
      include: { items: true },
      orderBy: { createdAt: "desc" }
    });
    res.json(orders.map(serializeOrder));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shopkeeper: accept an unassigned order.
router.patch("/:id/accept", requireClerkAuth, requireShopkeeperOrAdmin, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.shopkeeperId && order.shopkeeperId !== req.auth?.userId) {
      return res.status(409).json({ message: "Order already accepted by another shopkeeper" });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: { shopkeeperId: req.auth.userId, shopName: req.body.shopName || req.staffEmail || "Shopkeeper", status: "Accepted" },
      include: { items: true }
    });
    return res.json({ message: "Order accepted", order: serializeOrder(updatedOrder) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/shopkeeper-status", requireClerkAuth, requireShopkeeperOrAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ["Accepted", "Preparing", "Out for Delivery", "Delivered", "Cancelled"];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Allowed values: ${allowedStatuses.join(", ")}` });
    }

    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (req.staffRole !== "admin" && order.shopkeeperId !== req.auth?.userId) {
      return res.status(403).json({ message: "You can update only your accepted orders" });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: { status: toPrismaStatus(status) },
      include: { items: true }
    });
    return res.json({ message: "Shopkeeper order status updated", order: serializeOrder(updatedOrder) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Admin: get all orders
router.get("/", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } });
    res.json(orders.map(serializeOrder));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin/Chef: update order status
router.patch("/:id/status", requireClerkAuth, requireChefOrAdmin, async (req, res) => {
  try {
    const statusAliases = {
      accept: "Accepted", accepted: "Accepted", confirmed: "Accepted", preparing: "Preparing",
      "out for delivery": "Out for Delivery", delivered: "Delivered", pending: "Pending",
      cancelled: "Cancelled", canceled: "Cancelled"
    };
    const status = statusAliases[String(req.body.status || "").toLowerCase()] || req.body.status;
    const allowedStatuses = ["Pending", "Accepted", "Preparing", "Out for Delivery", "Delivered", "Cancelled"];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Allowed values: ${allowedStatuses.join(", ")}` });
    }

    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!order) return res.status(404).json({ message: "Order not found" });
    const belongsToChef = order.chefId === req.auth?.userId || order.shopkeeperId === req.auth?.userId ||
      order.items.some((item) => item.chefId === req.auth?.userId || item.shopkeeperId === req.auth?.userId);
    if (req.staffRole !== "admin" && !belongsToChef) {
      return res.status(403).json({ message: "You can update only your assigned orders" });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: { status: toPrismaStatus(status) },
      include: { items: true }
    });
    return res.json({ message: "Order status updated", order: serializeOrder(updatedOrder) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export { serializeOrder, toLegacyStatus, toPrismaStatus };
export default router;
