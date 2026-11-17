-- CreateTable
CREATE TABLE "signup_otps" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signup_otps_phone_createdAt_idx" ON "signup_otps"("phone", "createdAt");

