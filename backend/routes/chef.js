import express from "express";
import prisma from "../lib/prisma.js";
import { requireClerkAuth } from "../middleware/clerkAuth.js";
import { requireChefOrAdmin } from "../middleware/roleAuth.js";
import { serializeOrder } from "./order.js";

const router = express.Router();

const chefOrderWhere = (chefId) => ({
  OR: [
    { chefId },
    { shopkeeperId: chefId },
    { items: { some: { OR: [{ chefId }, { shopkeeperId: chefId }] } } }
  ]
});

const calculateChefSummary = (orders, menuCount, startOfToday) => {
  const paidOrders = orders.filter((order) => order.paymentStatus === "Paid");
  const todaysOrders = orders.filter((order) => new Date(order.createdAt) >= startOfToday);

  return {
    totalOrders: orders.length,
    todaysOrders: todaysOrders.length,
    earnings: paidOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
    todayMenuItems: menuCount
  };
};

router.get("/orders", requireClerkAuth, requireChefOrAdmin, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: chefOrderWhere(req.auth.userId),
      include: { items: true },
      orderBy: { createdAt: "desc" }
    });
    res.json(orders.map(serializeOrder));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/summary", requireClerkAuth, requireChefOrAdmin, async (req, res) => {
  try {
    const chefId = req.auth.userId;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [orders, menuCount] = await Promise.all([
      prisma.order.findMany({ where: chefOrderWhere(chefId), select: { paymentStatus: true, totalAmount: true, createdAt: true } }),
      prisma.food.count({ where: { OR: [{ chefId }, { shopkeeperId: chefId }], isTodayMenu: true } })
    ]);

    res.json(calculateChefSummary(orders, menuCount, startOfToday));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export { calculateChefSummary, chefOrderWhere };
export default router;
