import test from "node:test";
import assert from "node:assert/strict";
import { calculateAdminStats, serializeMenu, serializeMess } from "../routes/admin.js";

test("calculates admin dashboard statistics from Prisma-shaped data", () => {
  const startToday = new Date("2026-08-14T00:00:00.000Z");
  const startWeek = new Date("2026-08-08T00:00:00.000Z");
  const startMonth = new Date("2026-08-01T00:00:00.000Z");
  const stats = calculateAdminStats([
    { paymentStatus: "Paid", totalAmount: "100", createdAt: new Date("2026-08-14T08:00:00.000Z"), status: "Delivered" },
    { paymentStatus: "Pending", totalAmount: "75", createdAt: new Date("2026-08-14T09:00:00.000Z"), status: "Pending" },
    { paymentStatus: "Paid", totalAmount: "50", createdAt: new Date("2026-08-10T09:00:00.000Z"), status: "Cancelled" }
  ], [{ chefId: "chef-1" }], [
    { approvalStatus: "approved" }, { approvalStatus: "pending" }, { approvalStatus: "suspended" }, { approvalStatus: "rejected" }
  ], startToday, startWeek, startMonth);

  assert.deepEqual(stats, {
    totalOrders: 3, totalRevenue: 150, activeChefs: 1, totalMesses: 4,
    activeMesses: 1, pendingMesses: 1, suspendedMesses: 1, todaysOrders: 2,
    completedOrders: 1, cancelledOrders: 1, todayGrossOrderValue: 175,
    weekGrossOrderValue: 175, monthGrossOrderValue: 175
  });
});

test("serializes Prisma messes and populated menus to legacy Mongo-shaped responses", () => {
  assert.deepEqual(serializeMess({ id: "mess-1", name: "Kitchen", area: { name: "Campus Area" } }), {
    _id: "mess-1", name: "Kitchen", area: "Campus Area"
  });

  const menu = serializeMenu({
    id: "menu-1", messId: "mess-1", items: [{ id: "item-1", name: "Dal" }],
    mess: { id: "mess-1", name: "Kitchen", area: { name: "Campus Area" } }
  });
  assert.equal(menu._id, "menu-1");
  assert.equal(menu.items[0]._id, "item-1");
  assert.deepEqual(menu.messId, { _id: "mess-1", name: "Kitchen", area: "Campus Area" });
});
