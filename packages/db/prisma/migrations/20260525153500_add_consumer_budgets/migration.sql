-- AlterEnum: budget changes should be auditable.
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'budget';

-- CreateTable
CREATE TABLE "Budget" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Budget_userId_category_month_key" ON "Budget"("userId", "category", "month");

-- CreateIndex
CREATE INDEX "Budget_userId_month_idx" ON "Budget"("userId", "month");

-- CreateIndex
CREATE INDEX "Budget_category_idx" ON "Budget"("category");

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill organization scoping for existing audit events where linked entities still exist.
UPDATE "AuditEvent" AS ae
SET "organizationId" = d."organizationId"
FROM "Document" AS d
WHERE ae."documentId" = d."id" AND ae."organizationId" IS NULL;

UPDATE "AuditEvent" AS ae
SET "organizationId" = c."organizationId"
FROM "Claim" AS c
WHERE ae."claimId" = c."id" AND ae."organizationId" IS NULL AND c."organizationId" IS NOT NULL;

UPDATE "AuditEvent" AS ae
SET "organizationId" = d."organizationId"
FROM "Claim" AS c
JOIN "Document" AS d ON d."id" = c."documentId"
WHERE ae."claimId" = c."id" AND ae."organizationId" IS NULL;

UPDATE "AuditEvent" AS ae
SET "organizationId" = d."organizationId"
FROM "Review" AS r
JOIN "Document" AS d ON d."id" = r."documentId"
WHERE ae."reviewId" = r."id" AND ae."organizationId" IS NULL;

UPDATE "AuditEvent" AS ae
SET "organizationId" = d."organizationId"
FROM "ExtractionJob" AS ej
JOIN "Document" AS d ON d."id" = ej."documentId"
WHERE ae."extractionJobId" = ej."id" AND ae."organizationId" IS NULL;
