-- CreateEnum
CREATE TYPE "PlanRequestStatus" AS ENUM ('OPEN', 'DONE');

-- CreateTable
CREATE TABLE "plan_requests" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "planId" TEXT,
    "requestedById" TEXT,
    "message" TEXT,
    "status" "PlanRequestStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_requests_restaurantId_status_idx" ON "plan_requests"("restaurantId", "status");

-- AddForeignKey
ALTER TABLE "plan_requests" ADD CONSTRAINT "plan_requests_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_requests" ADD CONSTRAINT "plan_requests_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Platform billing data: never merged from an embedded install through
-- two-way sync (see 20261026000000_server_sync).
CREATE OR REPLACE FUNCTION sync_is_synced_table(t text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT t NOT LIKE 'sync\_%' AND t NOT IN
    ('_prisma_migrations', 'backups', 'backup_config', 'webhook_deliveries', 'download_stats', 'verifactu_records',
     'subscription_plans', 'restaurant_subscriptions', 'subscription_payments', 'platform_settings', 'app_releases',
     'plan_requests')
$$;
