-- Custom webhook bodies and headers.
ALTER TABLE "webhook_endpoints" ADD COLUMN "payloadTemplate" TEXT;
ALTER TABLE "webhook_endpoints" ADD COLUMN "headers" TEXT;
ALTER TABLE "webhook_endpoints" ADD COLUMN "headerNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
