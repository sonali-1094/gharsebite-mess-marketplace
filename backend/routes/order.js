import express from "express";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Food from "../models/Food.js";
import { requireClerkAuth } from "../middleware/clerkAuth.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { requireChefOrAdmin, requireShopkeeperOrAdmin } from "../middleware/roleAuth.js";
import { isDbConnected, requireDbConnection } from "../middleware/requireDbConnection.js";
import { createLocalOrder, getLocalOrders } from "../utils/localOrders.js";

const router = express.Router();

const getErrorText = (error) => {
  const parts = [
    error?.name,
    error?.code,
    error?.message,
    error?.reason?.message,
    error?.cause?.message,
    error?.stack
  ];

  if (error?.errors) {
    parts.push(...Object.values(error.errors).map((nestedError) => nestedError?.message));
  }

  return parts.filter(Boolean).join(" ");
};

const isDatabaseConnectionError = (error) =>
  /buffering timed out|insertOne.*timed out|server selection|topology|ECONNREFUSED|ENOTFOUND|ETIMEOUT|ESERVFAIL|ENODATA|MongoNetworkError|MongoServerSelectionError|MongoNotConnectedError|Client must be connected|Cannot call .* before initial connection|connection .* closed|not connected/i.test(
    getErrorText(error)
  );

const canCreateLocalOrder = (paymentMethod, error) =>
  paymentMethod === "COD" && isDatabaseConnectionError(error);

const createCodFallbackResponse = (res, orderPayload) => {
  const order = createLocalOrder(orderPayload);

  return res.status(201).json({
    message: "Cash on Delivery order placed in local memory because MongoDB is not available",
    order,
    localOnly: true
  });
};

// Place order
router.post("/place", requireClerkAuth, async (req, res) => {
  let orderPayload = null;
  let normalizedPaymentMethod = "COD";

  try {
    const userId = req.auth?.userId;
    const { items, totalAmount, address, paymentMethod = "COD", messId = "", orderType = "DELIVERY", deliveryCharge = 0 } = req.body;
    normalizedPaymentMethod =
      String(paymentMethod).toUpperCase() === "RAZORPAY" ? "RAZORPAY" : "COD";

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

    const foodIds = (items || [])
      .map((item) => item.foodId)
      .filter((foodId) => mongoose.isValidObjectId(foodId));
    let foods = [];

    if (isDbConnected()) {
      try {
        foods = await Food.find({ _id: { $in: foodIds } });
      } catch (error) {
        if (!canCreateLocalOrder(normalizedPaymentMethod, error)) {
          throw error;
        }
      }
    }

    const foodById = new Map(foods.map((food) => [food._id.toString(), food]));
    const enrichedItems = (items || []).map((item) => {
      const food = foodById.get(String(item.foodId));
      return {
        ...item,
        chefId: item.chefId || food?.chefId || food?.shopkeeperId || "",
        chefName: item.chefName || food?.chefName || food?.shopName || "",
        shopkeeperId: item.shopkeeperId || food?.shopkeeperId || food?.chefId || "",
        shopName: item.shopName || food?.shopName || food?.chefName || ""
      };
    });
    const primaryChefId = enrichedItems.find((item) => item.chefId)?.chefId || "";
    const primaryChefName = enrichedItems.find((item) => item.chefName)?.chefName || "";

    orderPayload = {
      userId,
      items: enrichedItems,
      totalAmount,
      address,
      messId: messId || itemMessIds[0] || "",
      orderType: String(orderType).toUpperCase() === "PICKUP" ? "PICKUP" : "DELIVERY",
      deliveryCharge: Number(deliveryCharge || 0),
      chefId: primaryChefId,
      chefName: primaryChefName,
      shopkeeperId: primaryChefId,
      shopName: primaryChefName,
      paymentMethod: normalizedPaymentMethod,
      paymentStatus: normalizedPaymentMethod === "COD" ? "Pending" : "Pending"
    };

    let order;
    let localOnly = false;

    if (isDbConnected()) {
      try {
        order = await Order.create(orderPayload);
      } catch (error) {
        if (!canCreateLocalOrder(normalizedPaymentMethod, error)) {
          throw error;
        }

        return createCodFallbackResponse(res, orderPayload);
      }
    } else if (normalizedPaymentMethod === "COD") {
      return createCodFallbackResponse(res, orderPayload);
    } else {
      return res.status(503).json({
        message: "Database is not connected. Razorpay orders need MongoDB before payment can start."
      });
    }

    res.status(201).json({
      message: !localOnly
        ? "Order placed"
        : "Order placed in local memory because MongoDB is not available",
      order,
      localOnly
    });
  } catch (err) {
    if (canCreateLocalOrder(normalizedPaymentMethod, err) && orderPayload) {
      return createCodFallbackResponse(res, orderPayload);
    }

    if (isDatabaseConnectionError(err)) {
      return res.status(503).json({
        message: "Database is not connected. Online payment needs MongoDB before payment can start.",
        error: err.message
      });
    }

    res.status(500).json({ error: err.message });
  }
});

// Chef: see only orders assigned to the signed-in chef.
router.get("/chef", requireClerkAuth, requireChefOrAdmin, requireDbConnection, async (req, res) => {
  try {
    const chefId = req.auth?.userId;
    const orders = await Order.find({
      $or: [
        { chefId },
        { shopkeeperId: chefId },
        { "items.chefId": chefId },
        { "items.shopkeeperId": chefId }
      ]
    }).sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user orders
router.get("/user/:id", requireClerkAuth, requireDbConnection, async (req, res) => {
  try {
    if (req.auth?.userId !== req.params.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const orders = await Order.find({ userId: req.params.id });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shopkeeper: see own accepted orders and open orders waiting for a shopkeeper.
router.get("/shopkeeper", requireClerkAuth, requireShopkeeperOrAdmin, requireDbConnection, async (req, res) => {
  try {
    const shopkeeperId = req.auth?.userId;
    const orders = await Order.find({
      $or: [
        { shopkeeperId },
        { shopkeeperId: "" },
        { shopkeeperId: { $exists: false } }
      ],
      status: { $ne: "Cancelled" }
    }).sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shopkeeper: accept an unassigned order.
router.patch("/:id/accept", requireClerkAuth, requireShopkeeperOrAdmin, requireDbConnection, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.shopkeeperId && order.shopkeeperId !== req.auth?.userId) {
      return res.status(409).json({ message: "Order already accepted by another shopkeeper" });
    }

    order.shopkeeperId = req.auth.userId;
    order.shopName = req.body.shopName || req.staffEmail || "Shopkeeper";
    order.status = "Accepted";
    await order.save();

    return res.json({ message: "Order accepted", order });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Shopkeeper: update only their accepted order status.
router.patch("/:id/shopkeeper-status", requireClerkAuth, requireShopkeeperOrAdmin, requireDbConnection, async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ["Accepted", "Preparing", "Out for Delivery", "Delivered", "Cancelled"];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Allowed values: ${allowedStatuses.join(", ")}`
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (req.staffRole !== "admin" && order.shopkeeperId !== req.auth?.userId) {
      return res.status(403).json({ message: "You can update only your accepted orders" });
    }

    order.status = status;
    await order.save();

    return res.json({ message: "Shopkeeper order status updated", order });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Admin: get all orders
router.get("/", requireClerkAuth, requireAdmin, async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.json(getLocalOrders());
    }

    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update order status
router.patch("/:id/status", requireClerkAuth, requireChefOrAdmin, requireDbConnection, async (req, res) => {
  try {
    const statusAliases = {
      accept: "Accepted",
      accepted: "Accepted",
      confirmed: "Accepted",
      preparing: "Preparing",
      "out for delivery": "Out for Delivery",
      delivered: "Delivered",
      pending: "Pending",
      cancelled: "Cancelled",
      canceled: "Cancelled"
    };
    const status = statusAliases[String(req.body.status || "").toLowerCase()] || req.body.status;
    const allowedStatuses = ["Pending", "Accepted", "Preparing", "Out for Delivery", "Delivered", "Cancelled"];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Allowed values: ${allowedStatuses.join(", ")}`
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const belongsToChef =
      order.chefId === req.auth?.userId ||
      order.shopkeeperId === req.auth?.userId ||
      order.items?.some((item) => item.chefId === req.auth?.userId || item.shopkeeperId === req.auth?.userId);

    if (req.staffRole !== "admin" && !belongsToChef) {
      return res.status(403).json({ message: "You can update only your assigned orders" });
    }

    order.status = status;
    await order.save();

    return res.json({ message: "Order status updated", order });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
