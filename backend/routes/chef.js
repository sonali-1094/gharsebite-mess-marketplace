import express from "express";
import Food from "../models/Food.js";
import Order from "../models/Order.js";
import { requireClerkAuth } from "../middleware/clerkAuth.js";
import { requireChefOrAdmin } from "../middleware/roleAuth.js";
import { requireDbConnection } from "../middleware/requireDbConnection.js";

const router = express.Router();

const chefOrderQuery = (chefId) => ({
  $or: [
    { chefId },
    { shopkeeperId: chefId },
    { "items.chefId": chefId },
    { "items.shopkeeperId": chefId }
  ]
});

router.get("/orders", requireClerkAuth, requireChefOrAdmin, requireDbConnection, async (req, res) => {
  try {
    const orders = await Order.find(chefOrderQuery(req.auth.userId)).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/summary", requireClerkAuth, requireChefOrAdmin, requireDbConnection, async (req, res) => {
  try {
    const chefId = req.auth.userId;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [orders, menuCount] = await Promise.all([
      Order.find(chefOrderQuery(chefId)),
      Food.countDocuments({ $or: [{ chefId }, { shopkeeperId: chefId }], isTodayMenu: true })
    ]);

    const paidOrders = orders.filter((order) => order.paymentStatus === "Paid");
    const todaysOrders = orders.filter((order) => new Date(order.createdAt) >= startOfToday);

    res.json({
      totalOrders: orders.length,
      todaysOrders: todaysOrders.length,
      earnings: paidOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
      todayMenuItems: menuCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
