CREATE TYPE "AuthTokenPurpose" AS ENUM ('password_reset', 'email_verification');

ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE TABLE "AuthAccountToken" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "purpose" "AuthTokenPurpose" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AuthAccountToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthAccountToken_tokenHash_key" ON "AuthAccountToken"("tokenHash");
CREATE INDEX "AuthAccountToken_userId_idx" ON "AuthAccountToken"("userId");
CREATE INDEX "AuthAccountToken_purpose_idx" ON "AuthAccountToken"("purpose");
CREATE INDEX "AuthAccountToken_expiresAt_idx" ON "AuthAccountToken"("expiresAt");
CREATE INDEX "AuthAccountToken_consumedAt_idx" ON "AuthAccountToken"("consumedAt");

ALTER TABLE "AuthAccountToken"
  ADD CONSTRAINT "AuthAccountToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
