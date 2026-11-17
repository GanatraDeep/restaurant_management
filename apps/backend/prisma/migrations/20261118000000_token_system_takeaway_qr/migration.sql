-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "takeawayQrToken" TEXT,
ADD COLUMN     "tokenEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "branches_takeawayQrToken_key" ON "branches"("takeawayQrToken");

