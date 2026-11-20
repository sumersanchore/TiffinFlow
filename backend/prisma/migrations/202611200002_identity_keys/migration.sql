-- Normalized identity keys used for duplicate detection.
ALTER TABLE "Lead"
  ADD COLUMN "phoneKey" TEXT,
  ADD COLUMN "whatsappKey" TEXT,
  ADD COLUMN "websiteKey" TEXT;

CREATE INDEX "Lead_phoneKey_idx" ON "Lead"("phoneKey");
CREATE INDEX "Lead_whatsappKey_idx" ON "Lead"("whatsappKey");
CREATE INDEX "Lead_websiteKey_idx" ON "Lead"("websiteKey");
