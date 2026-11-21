-- Counter items (not sent to the kitchen) print on a counter slip.
ALTER TABLE "order_items" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "order_items" ADD COLUMN "counterPrintedAt" TIMESTAMP(3);
-- Existing counter items are history: never print them on a "new" slip.
UPDATE "order_items" oi SET "counterPrintedAt" = CURRENT_TIMESTAMP
FROM "menu_items" mi WHERE mi.id = oi."menuItemId" AND mi."sendToKitchen" = false;
