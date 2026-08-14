import express from "express";
import crypto from "node:crypto";
import Razorpay from "razorpay";
import prisma from "../lib/prisma.js";
import { requireClerkAuth } from "../middleware/clerkAuth.js";
import { toLegacyStatus } from "./order.js";

const router = express.Router();

const getRazorpayInstance = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required in backend/.env");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const createRazorpaySignature = (value, secret) =>
  crypto.createHmac("sha256", secret).update(value).digest("hex");

const isValidWebhookSignature = (rawBody, signature, secret) =>
  createRazorpaySignature(rawBody, secret) === signature;

const serializePaymentOrder = ({ id, userId, status, ...order }) => ({
  _id: id,
  ...order,
  status: toLegacyStatus(status)
});

const findOrderFromWebhookEntity = async (paymentEntity) => {
  const appOrderId = paymentEntity?.notes?.appOrderId;
  if (appOrderId) {
    const orderByAppId = await prisma.order.findUnique({ where: { id: appOrderId } });
    if (orderByAppId) return orderByAppId;
  }

  const paymentIds = [paymentEntity?.order_id, paymentEntity?.id].filter(Boolean);
  if (!paymentIds.length) return null;
  return prisma.order.findFirst({ where: { paymentId: { in: paymentIds } } });
};

router.post("/webhook", async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).json({ message: "RAZORPAY_WEBHOOK_SECRET is not configured" });

    const signature = req.headers["x-razorpay-signature"];
    if (!signature || Array.isArray(signature)) return res.status(400).json({ message: "Missing x-razorpay-signature header" });

    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) return res.status(400).json({ message: "Webhook requires raw request body" });
    if (!isValidWebhookSignature(rawBody, signature, webhookSecret)) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const event = payload?.event;
    const paymentEntity = payload?.payload?.payment?.entity;
    if (!paymentEntity) return res.status(400).json({ message: "Invalid webhook payload" });

    const order = await findOrderFromWebhookEntity(paymentEntity);
    if (!order) return res.status(404).json({ message: "Order not found for webhook payment" });

    if (event === "payment.captured") {
      const alreadyApplied = order.paymentStatus === "Paid" && order.paymentId === paymentEntity.id;
      if (!alreadyApplied) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: "Paid",
            paymentMethod: "RAZORPAY",
            paymentId: paymentEntity.id,
            paidAt: order.paidAt || new Date(),
            ...(order.status === "Pending" ? { status: "Preparing" } : {})
          }
        });
      }
      return res.json({ message: "Webhook processed", event });
    }

    if (event === "payment.failed") {
      const alreadyApplied = order.paymentStatus === "Failed" && order.paymentId === paymentEntity.id;
      if (!alreadyApplied) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: "Failed",
            paymentMethod: "RAZORPAY",
            paymentId: paymentEntity.id || paymentEntity.order_id || order.paymentId
          }
        });
      }
      return res.json({ message: "Webhook processed", event });
    }

    return res.json({ message: "Event ignored", event });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/key", (req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) return res.status(500).json({ message: "Razorpay key is not configured" });
  return res.json({ key: keyId });
});

// Create Razorpay order
router.post("/create-session", requireClerkAuth, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.auth?.userId;
    if (!orderId) return res.status(400).json({ message: "orderId is required" });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.userId !== userId) return res.status(403).json({ message: "Forbidden" });
    if (order.paymentStatus === "Paid") return res.status(400).json({ message: "Order already paid" });

    const amountInPaise = Math.round(Number(order.totalAmount) * 100);
    if (!amountInPaise || amountInPaise <= 0) return res.status(400).json({ message: "Invalid order totalAmount" });

    const razorpay = getRazorpayInstance();
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `order_${order.id.slice(-8)}`,
      notes: { appOrderId: order.id }
    });

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: { paymentMethod: "RAZORPAY", paymentStatus: "Processing", paymentId: razorpayOrder.id }
    });

    return res.json({
      message: "Razorpay order created",
      orderId: updatedOrder.id,
      razorpayOrderId: razorpayOrder.id,
      key: process.env.RAZORPAY_KEY_ID,
      amount: amountInPaise,
      currency: "INR",
      paymentStatus: updatedOrder.paymentStatus
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Verify Razorpay payment signature
router.post("/verify", requireClerkAuth, async (req, res) => {
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) return res.status(500).json({ message: "Razorpay secret is not configured" });

    const { orderId, razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: razorpaySignature } = req.body;
    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: "orderId, razorpay_order_id, razorpay_payment_id and razorpay_signature are required" });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.userId !== req.auth?.userId) return res.status(403).json({ message: "Forbidden" });

    if (createRazorpaySignature(`${razorpayOrderId}|${razorpayPaymentId}`, keySecret) !== razorpaySignature) {
      await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "Failed" } });
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "Paid", paidAt: new Date(), status: "Preparing", paymentMethod: "RAZORPAY", paymentId: razorpayPaymentId }
    });
    return res.json({ message: "Payment verified", orderId: updatedOrder.id, paymentStatus: updatedOrder.paymentStatus, paidAt: updatedOrder.paidAt });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Get payment status for one order
router.get("/status/:orderId", requireClerkAuth, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      select: { id: true, userId: true, totalAmount: true, paymentStatus: true, paymentMethod: true, paymentId: true, paidAt: true, status: true }
    });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.userId !== req.auth?.userId) return res.status(403).json({ message: "Forbidden" });
    return res.json(serializePaymentOrder(order));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export { createRazorpaySignature, isValidWebhookSignature, serializePaymentOrder };
export default router;
