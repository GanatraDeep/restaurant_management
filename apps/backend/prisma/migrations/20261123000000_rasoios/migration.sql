-- CreateTable
CREATE TABLE "sops" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "category" TEXT,
    "yieldText" TEXT,
    "prepMinutes" INTEGER,
    "variants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ingredients" JSONB NOT NULL DEFAULT '[]',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "packaging" JSONB NOT NULL DEFAULT '[]',
    "accompaniments" JSONB NOT NULL DEFAULT '[]',
    "plating" JSONB,
    "quiz" JSONB NOT NULL DEFAULT '[]',
    "audioUrl" TEXT,
    "coverUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "shareToken" TEXT,
    "starterKey" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sop_versions" (
    "id" TEXT NOT NULL,
    "sopId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changeNote" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sop_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sop_acks" (
    "id" TEXT NOT NULL,
    "sopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "quizScore" INTEGER,
    "quizTotal" INTEGER,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sop_acks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playbooks" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'DAILY',
    "dueTime" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "remindedFor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_runs" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "entries" JSONB NOT NULL DEFAULT '{}',
    "log" JSONB NOT NULL DEFAULT '[]',
    "completedAt" TIMESTAMP(3),
    "completedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_items" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT,
    "provider" TEXT,
    "providerPhone" TEXT,
    "issuedOn" DATE,
    "expiresOn" DATE,
    "remindDays" INTEGER NOT NULL DEFAULT 30,
    "cost" DECIMAL(12,2),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRemindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sops_shareToken_key" ON "sops"("shareToken");

-- CreateIndex
CREATE INDEX "sops_restaurantId_isArchived_idx" ON "sops"("restaurantId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "sop_versions_sopId_version_key" ON "sop_versions"("sopId", "version");

-- CreateIndex
CREATE INDEX "sop_acks_userId_idx" ON "sop_acks"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sop_acks_sopId_userId_version_key" ON "sop_acks"("sopId", "userId", "version");

-- CreateIndex
CREATE INDEX "playbooks_restaurantId_idx" ON "playbooks"("restaurantId");

-- CreateIndex
CREATE INDEX "checklist_templates_branchId_isActive_idx" ON "checklist_templates"("branchId", "isActive");

-- CreateIndex
CREATE INDEX "checklist_runs_branchId_periodKey_idx" ON "checklist_runs"("branchId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_runs_templateId_periodKey_key" ON "checklist_runs"("templateId", "periodKey");

-- CreateIndex
CREATE INDEX "compliance_items_branchId_expiresOn_idx" ON "compliance_items"("branchId", "expiresOn");

-- AddForeignKey
ALTER TABLE "sops" ADD CONSTRAINT "sops_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_versions" ADD CONSTRAINT "sop_versions_sopId_fkey" FOREIGN KEY ("sopId") REFERENCES "sops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_acks" ADD CONSTRAINT "sop_acks_sopId_fkey" FOREIGN KEY ("sopId") REFERENCES "sops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_acks" ADD CONSTRAINT "sop_acks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One-time grant of the new Kitchen SOP permissions to the built-in roles of
-- restaurants that already exist (new restaurants get them at signup, and
-- OWNER/ADMINISTRATOR are backfilled on every boot). Owners can change these
-- later under Settings > Roles.
INSERT INTO "permissions" ("id", "key", "label", "category") VALUES
  (gen_random_uuid()::text, 'sop.view', 'Read Kitchen SOPs & Fill Checklists', 'Kitchen SOPs'),
  (gen_random_uuid()::text, 'sop.manage', 'Write SOPs, Checklists, Playbooks & Licences', 'Kitchen SOPs')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" = 'sop.view'
WHERE r."isSystem" = true
  AND r."name" IN ('RESTAURANT_MANAGER', 'CASHIER', 'WAITER', 'KITCHEN_STAFF', 'CHEF', 'BARTENDER', 'DELIVERY_STAFF')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" = 'sop.manage'
WHERE r."isSystem" = true
  AND r."name" IN ('RESTAURANT_MANAGER', 'CHEF')
ON CONFLICT DO NOTHING;
