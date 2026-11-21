import assert from "node:assert/strict";
import test from "node:test";
import { estimateTakeawayCharge } from "./takeaway-estimate.ts";

const items = new Map([
  ["a", { takeawayCharge: "10", categoryId: "c1" }],
  ["b", { takeawayCharge: null, categoryId: "c1" }],
  ["z", { takeawayCharge: "0", categoryId: "c1" }],
]);
const categoryCharge = new Map<string, number | null>([["c1", 5]]);

test("item charge wins, else category, plus per-bill amount on takeaway", () => {
  const units = [{ menuItemId: "a", quantity: 2 }, { menuItemId: "b", quantity: 3 }, { menuItemId: "z", quantity: 4 }];
  assert.equal(estimateTakeawayCharge({ orderType: "TAKEAWAY", onDelivery: false, perOrder: 7.5, units, items, categoryCharge }), 42.5);
  assert.equal(estimateTakeawayCharge({ orderType: "DINE_IN", onDelivery: true, perOrder: 7.5, units, items, categoryCharge }), 0);
  assert.equal(estimateTakeawayCharge({ orderType: "DELIVERY", onDelivery: true, perOrder: 0, units, items, categoryCharge }), 35);
  assert.equal(estimateTakeawayCharge({ orderType: "TAKEAWAY", onDelivery: false, perOrder: 7.5, units: [], items, categoryCharge }), 0);
});
