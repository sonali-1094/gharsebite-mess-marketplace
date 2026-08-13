import express from "express";
import crypto from "node:crypto";
import Razorpay from "razorpay";
import Order from "../models/Order.js";
import { requireClerkAuth } from "../middleware/clerkAuth.js";
import { requireDbConnection } from "../middleware/requireDbConnection.js";
import { findLocalOrderById } from "../utils/localOrders.js";

const router = express.Router();

const getRazorpayInstance = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required in backend/.env");
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
};

const findOrderFromWebhookEntity = async (paymentEntity) => {
  const appOrderId = paymentEntity?.notes?.appOrderId;

  if (appOrderId) {
    const orderByAppId = await Order.findById(appOrderId);
    if (orderByAppId) return orderByAppId;
  }

  if (paymentEntity?.order_id) {
    const orderByGatewayOrderId = await Order.findOne({ paymentId: paymentEntity.order_id });
    if (orderByGatewayOrderId) return orderByGatewayOrderId;
  }

  if (paymentEntity?.id) {
    const orderByPaymentId = await Order.findOne({ paymentId: paymentEntity.id });
    if (orderByPaymentId) return orderByPaymentId;
  }

  return null;
};

router.post("/webhook", requireDbConnection, async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(500).json({ message: "RAZORPAY_WEBHOOK_SECRET is not configured" });
    }

    const signature = req.headers["x-razorpay-signature"];
    if (!signature || Array.isArray(signature)) {
      return res.status(400).json({ message: "Missing x-razorpay-signature header" });
    }

    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ message: "Webhook requires raw request body" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== signature) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const event = payload?.event;
    const paymentEntity = payload?.payload?.payment?.entity;

    if (!paymentEntity) {
      return res.status(400).json({ message: "Invalid webhook payload" });
    }

    const order = await findOrderFromWebhookEntity(paymentEntity);
    if (!order) {
      return res.status(404).json({ message: "Order not found for webhook payment" });
    }

    if (event === "payment.captured") {
      const alreadyApplied =
        order.paymentStatus === "Paid" && order.paymentId === paymentEntity.id;

      if (!alreadyApplied) {
        order.paymentStatus = "Paid";
        order.paymentMethod = "RAZORPAY";
        order.paymentId = paymentEntity.id;
        order.paidAt = order.paidAt || new Date();
        if (order.status === "Pending") {
          order.status = "Preparing";
        }
        await order.save();
      }

      return res.json({ message: "Webhook processed", event });
    }

    if (event === "payment.failed") {
      const alreadyApplied =
        order.paymentStatus === "Failed" && order.paymentId === paymentEntity.id;

      if (!alreadyApplied) {
        order.paymentStatus = "Failed";
        order.paymentMethod = "RAZORPAY";
        order.paymentId = paymentEntity.id || paymentEntity.order_id || order.paymentId;
        await order.save();
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
  if (!keyId) {
    return res.status(500).json({ message: "Razorpay key is not configured" });
  }

  return res.json({ key: keyId });
});

// Create Razorpay order
router.post("/create-session", requireClerkAuth, requireDbConnection, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.auth?.userId;

    if (!orderId) {
      return res.status(400).json({ message: "orderId is required" });
    }

    const order = await Order.findById(orderId);
    if (!order && findLocalOrderById(orderId)) {
      return res.status(400).json({
        message: "Razorpay payment needs MongoDB. Use Cash on Delivery while the database is offline."
      });
    }

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.userId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (order.paymentStatus === "Paid") {
      return res.status(400).json({ message: "Order already paid" });
    }

    const razorpay = getRazorpayInstance();
    const amountInPaise = Math.round(Number(order.totalAmount) * 100);
    if (!amountInPaise || amountInPaise <= 0) {
      return res.status(400).json({ message: "Invalid order totalAmount" });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `order_${order._id.toString().slice(-8)}`,
      notes: {
        appOrderId: order._id.toString()
      }
    });

    order.paymentMethod = "RAZORPAY";
    order.paymentStatus = "Processing";
    order.paymentId = razorpayOrder.id;
    await order.save();

    return res.json({
      message: "Razorpay order created",
      orderId: order._id,
      razorpayOrderId: razorpayOrder.id,
      key: process.env.RAZORPAY_KEY_ID,
      amount: amountInPaise,
      currency: "INR",
      paymentStatus: order.paymentStatus
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Verify Razorpay payment signature
router.post("/verify", requireClerkAuth, requireDbConnection, async (req, res) => {
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(500).json({ message: "Razorpay secret is not configured" });
    }

    const {
      orderId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature
    } = req.body;

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        message: "orderId, razorpay_order_id, razorpay_payment_id and razorpay_signature are required"
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.userId !== req.auth?.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      order.paymentStatus = "Failed";
      await order.save();
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    order.paymentStatus = "Paid";
    order.paidAt = new Date();
    order.status = "Preparing";
    order.paymentMethod = "RAZORPAY";
    order.paymentId = razorpayPaymentId;

    await order.save();

    return res.json({
      message: "Payment verified",
      orderId: order._id,
      paymentStatus: order.paymentStatus,
      paidAt: order.paidAt
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Get payment status for one order
router.get("/status/:orderId", requireClerkAuth, requireDbConnection, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).select(
      "_id totalAmount paymentStatus paymentMethod paymentId paidAt status"
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.userId !== req.auth?.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.json(order);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
