-- Per item, for items not sent to the kitchen: counter slip (default) or no ticket at all.
ALTER TABLE "menu_items" ADD COLUMN "counterSlip" BOOLEAN NOT NULL DEFAULT true;
