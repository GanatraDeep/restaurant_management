-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "qrPayFirst" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "guestPaidAt" TIMESTAMP(3),
ADD COLUMN     "guestPayRef" TEXT,
ADD COLUMN     "payFirst" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "guest_otps" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guest_otps_branchId_phone_createdAt_idx" ON "guest_otps"("branchId", "phone", "createdAt");


-- Guest OTPs are short-lived and per-server; keep them out of two-way sync.
CREATE OR REPLACE FUNCTION sync_is_synced_table(t text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT t NOT LIKE 'sync\_%' AND t NOT IN
    ('_prisma_migrations', 'backups', 'backup_config', 'webhook_deliveries', 'download_stats', 'verifactu_records',
     'subscription_plans', 'restaurant_subscriptions', 'subscription_payments', 'platform_settings', 'app_releases',
     'plan_requests', 'guest_otps')
$$;
