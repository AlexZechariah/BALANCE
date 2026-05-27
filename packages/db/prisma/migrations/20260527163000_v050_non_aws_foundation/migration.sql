-- Balance v0.5.0 non-AWS foundation.
-- Additive only: keep existing Textract/S3 enum values readable as legacy history.

ALTER TYPE "StorageDriver" ADD VALUE IF NOT EXISTS 's3Compatible';

ALTER TYPE "ExtractionProvider" ADD VALUE IF NOT EXISTS 'paddleocr';
ALTER TYPE "ExtractionProvider" ADD VALUE IF NOT EXISTS 'legacy_textract';

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "storageProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "storageBucket" TEXT,
  ADD COLUMN IF NOT EXISTS "storageEtag" TEXT,
  ADD COLUMN IF NOT EXISTS "storageSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "storageSizeBytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "storageContentType" TEXT,
  ADD COLUMN IF NOT EXISTS "pageCount" INTEGER;

ALTER TABLE "ExtractionJob"
  ADD COLUMN IF NOT EXISTS "pipelineVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "warningCodes" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "confidenceSummary" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "ExtractionArtifact"
  ADD COLUMN IF NOT EXISTS "artifactType" TEXT,
  ADD COLUMN IF NOT EXISTS "stage" TEXT,
  ADD COLUMN IF NOT EXISTS "payload" JSONB NOT NULL DEFAULT '{}';
