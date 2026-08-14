import test from "node:test";
import assert from "node:assert/strict";
import { createRazorpaySignature, isValidWebhookSignature, serializePaymentOrder } from "../routes/payment.js";

test("validates Razorpay webhook signatures from the exact raw body", () => {
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const secret = "webhook-secret";
  const signature = createRazorpaySignature(rawBody, secret);

  assert.equal(isValidWebhookSignature(rawBody, signature, secret), true);
  assert.equal(isValidWebhookSignature(rawBody, "invalid", secret), false);
});

test("creates the Razorpay verification signature payload", () => {
  assert.equal(
    createRazorpaySignature("order_123|pay_456", "payment-secret"),
    "6258ab658aefb10efb98fd20c7a3a2eb031c94e8546886370af0bc5b808249d8"
  );
});

test("serializes Prisma payment status responses with legacy identifiers and statuses", () => {
  const response = serializePaymentOrder({
    id: "order-1",
    userId: "user-1",
    totalAmount: "150",
    paymentStatus: "Paid",
    paymentMethod: "RAZORPAY",
    paymentId: "pay_123",
    paidAt: new Date("2026-08-14T00:00:00.000Z"),
    status: "OutForDelivery"
  });

  assert.equal(response._id, "order-1");
  assert.equal(response.status, "Out for Delivery");
  assert.equal("userId" in response, false);
});
