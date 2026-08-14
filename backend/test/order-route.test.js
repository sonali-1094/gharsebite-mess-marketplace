import test from "node:test";
import assert from "node:assert/strict";
import { serializeOrder, toLegacyStatus, toPrismaStatus } from "../routes/order.js";

test("maps legacy order statuses to Prisma enum values and back", () => {
  assert.equal(toPrismaStatus("Out for Delivery"), "OutForDelivery");
  assert.equal(toPrismaStatus("Ready for Pickup"), "ReadyForPickup");
  assert.equal(toLegacyStatus("OutForDelivery"), "Out for Delivery");
  assert.equal(toLegacyStatus("ReadyForPickup"), "Ready for Pickup");
});

test("serializes Prisma orders to the existing Mongo-shaped response contract", () => {
  const order = serializeOrder({
    id: "order-1",
    messId: null,
    status: "OutForDelivery",
    totalAmount: "120",
    createdAt: new Date("2026-08-14T00:00:00.000Z"),
    updatedAt: new Date("2026-08-14T00:00:00.000Z"),
    items: [
      {
        id: "item-1",
        menuId: "menu-1",
        foodId: null,
        name: "Lunch meal",
        price: "120",
        quantity: 1,
        chefId: "",
        chefName: "",
        shopkeeperId: "",
        shopName: "",
        createdAt: new Date("2026-08-14T00:00:00.000Z")
      }
    ]
  });

  assert.equal(order._id, "order-1");
  assert.equal(order.messId, "");
  assert.equal(order.status, "Out for Delivery");
  assert.equal(order.items[0]._id, "item-1");
  assert.equal(order.items[0].foodId, "menu-1");
  assert.equal("menuId" in order.items[0], false);
  assert.equal("createdAt" in order.items[0], false);
});
