-- WhatsApp bill messages from the platform number, paid from a per-restaurant wallet.
ALTER TABLE "restaurants" ADD COLUMN "waWalletMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "restaurants" ADD COLUMN "waBillAuto" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "platform_settings" ADD COLUMN "waMessagePriceMinor" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "platform_settings" ADD COLUMN "waMinTopUpMinor" INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE "platform_settings" ADD COLUMN "waTrialCreditMinor" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "note" TEXT,
    "orderId" TEXT,
    "sentTo" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wallet_transactions_restaurantId_createdAt_idx" ON "wallet_transactions"("restaurantId", "createdAt");
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
