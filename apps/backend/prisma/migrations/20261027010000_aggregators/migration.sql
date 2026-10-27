-- CreateEnum
CREATE TYPE "AggregatorProvider" AS ENUM ('ZOMATO', 'SWIGGY');

-- CreateEnum
CREATE TYPE "AggregatorOrderState" AS ENUM ('RECEIVED', 'FAILED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "aggregator" "AggregatorProvider";

-- CreateTable
CREATE TABLE "aggregator_connections" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "provider" "AggregatorProvider" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "outletId" TEXT,
    "autoAccept" BOOLEAN NOT NULL DEFAULT false,
    "webhookSecret" TEXT NOT NULL,
    "statusCallbackUrl" TEXT,
    "apiKey" TEXT,
    "lastOrderAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aggregator_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aggregator_item_mappings" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalItemId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aggregator_item_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aggregator_orders" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "orderId" TEXT,
    "state" "AggregatorOrderState" NOT NULL,
    "error" TEXT,
    "payload" JSONB NOT NULL,
    "lastStatusSent" TEXT,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aggregator_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aggregator_connections_branchId_provider_key" ON "aggregator_connections"("branchId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "aggregator_item_mappings_connectionId_externalItemId_key" ON "aggregator_item_mappings"("connectionId", "externalItemId");

-- CreateIndex
CREATE UNIQUE INDEX "aggregator_orders_orderId_key" ON "aggregator_orders"("orderId");

-- CreateIndex
CREATE INDEX "aggregator_orders_connectionId_createdAt_idx" ON "aggregator_orders"("connectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "aggregator_orders_connectionId_externalOrderId_key" ON "aggregator_orders"("connectionId", "externalOrderId");

-- AddForeignKey
ALTER TABLE "aggregator_connections" ADD CONSTRAINT "aggregator_connections_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregator_item_mappings" ADD CONSTRAINT "aggregator_item_mappings_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "aggregator_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregator_item_mappings" ADD CONSTRAINT "aggregator_item_mappings_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregator_orders" ADD CONSTRAINT "aggregator_orders_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "aggregator_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregator_orders" ADD CONSTRAINT "aggregator_orders_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

