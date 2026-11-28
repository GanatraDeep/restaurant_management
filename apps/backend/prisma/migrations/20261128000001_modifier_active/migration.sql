-- Add-ons: hide sold-out options, and keep groups/options that orders refer to.
ALTER TABLE "modifier_groups" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "modifiers" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
