-- WhatsApp OTP login reuses the signup OTP table.
ALTER TABLE "signup_otps" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'signup';

-- Branch policy set by super admins.
ALTER TABLE "platform_settings" ADD COLUMN "branchMode" TEXT NOT NULL DEFAULT 'ADMIN_ONLY';
ALTER TABLE "platform_settings" ADD COLUMN "includedBranches" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "platform_settings" ADD COLUMN "branchPriceMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "restaurants" ADD COLUMN "extraBranches" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscription_payments" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'PLAN';

-- Restaurants that already run more branches keep them.
UPDATE "restaurants" r SET "extraBranches" = GREATEST(c.n - 1, 0)
FROM (SELECT "restaurantId", COUNT(*)::int AS n FROM "branches" GROUP BY "restaurantId") c
WHERE c."restaurantId" = r.id;

-- Shared admin to-do list.
CREATE TABLE "admin_todos" (
    "id" TEXT NOT NULL,
    "list" TEXT NOT NULL DEFAULT 'Demo checklist',
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneByName" TEXT,
    "doneAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_todos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_todos_list_sortOrder_idx" ON "admin_todos"("list", "sortOrder");
