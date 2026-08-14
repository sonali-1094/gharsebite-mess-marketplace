import test from "node:test";
import assert from "node:assert/strict";
import { calculateChefSummary, chefOrderWhere } from "../routes/chef.js";

test("builds the Prisma order filter for chef and assigned order items", () => {
  assert.deepEqual(chefOrderWhere("chef-1"), {
    OR: [
      { chefId: "chef-1" },
      { shopkeeperId: "chef-1" },
      { items: { some: { OR: [{ chefId: "chef-1" }, { shopkeeperId: "chef-1" }] } } }
    ]
  });
});

test("calculates chef dashboard totals from Prisma order values", () => {
  const startOfToday = new Date("2026-08-14T00:00:00.000Z");
  const summary = calculateChefSummary([
    { paymentStatus: "Paid", totalAmount: "100", createdAt: new Date("2026-08-14T08:00:00.000Z") },
    { paymentStatus: "Pending", totalAmount: "75", createdAt: new Date("2026-08-14T09:00:00.000Z") },
    { paymentStatus: "Paid", totalAmount: "50", createdAt: new Date("2026-08-13T23:00:00.000Z") }
  ], 3, startOfToday);

  assert.deepEqual(summary, { totalOrders: 3, todaysOrders: 2, earnings: 150, todayMenuItems: 3 });
});
