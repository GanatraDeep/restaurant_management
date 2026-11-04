-- AlterTable
ALTER TABLE "kots" ADD COLUMN     "kotNo" INTEGER;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "sendToKitchen" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "receiptFooter" TEXT;

