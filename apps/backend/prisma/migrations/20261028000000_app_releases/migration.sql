-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('AVAILABLE', 'DEPLOYING', 'DEPLOYED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "app_releases" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "commitSha" TEXT,
    "message" TEXT,
    "author" TEXT,
    "url" TEXT,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'AVAILABLE',
    "error" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "deployedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_releases_tag_key" ON "app_releases"("tag");

-- CreateIndex
CREATE INDEX "app_releases_createdAt_idx" ON "app_releases"("createdAt");


-- Release history describes this server's own deployments; never merge it from
-- an embedded install through two-way sync (see 20261026000000_server_sync).
CREATE OR REPLACE FUNCTION sync_is_synced_table(t text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT t NOT LIKE 'sync\_%' AND t NOT IN
    ('_prisma_migrations', 'backups', 'backup_config', 'webhook_deliveries', 'download_stats', 'verifactu_records',
     'subscription_plans', 'restaurant_subscriptions', 'subscription_payments', 'platform_settings', 'app_releases')
$$;
