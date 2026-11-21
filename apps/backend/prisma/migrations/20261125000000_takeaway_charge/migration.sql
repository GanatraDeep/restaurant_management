-- Takeaway (packing) charge at category, item and invoice level.
ALTER TABLE "menu_categories" ADD COLUMN "takeawayCharge" DECIMAL(10,2);
ALTER TABLE "menu_items" ADD COLUMN "takeawayCharge" DECIMAL(10,2);
ALTER TABLE "branches" ADD COLUMN "takeawayChargePerOrder" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "branches" ADD COLUMN "takeawayChargeOnDelivery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "takeawayCharge" DECIMAL(12,2) NOT NULL DEFAULT 0;
