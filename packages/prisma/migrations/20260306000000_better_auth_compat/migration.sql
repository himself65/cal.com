-- Add better-auth compatibility columns to Session table
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add better-auth compatibility columns to Account table
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "password" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "accessTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "refreshTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create BetterAuthVerification table for better-auth's verification flow
-- Separate from VerificationToken which has Cal.com-specific fields (teamId, secondaryEmailId)
CREATE TABLE IF NOT EXISTS "BetterAuthVerification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetterAuthVerification_pkey" PRIMARY KEY ("id")
);

-- Index for lookup by identifier
CREATE INDEX IF NOT EXISTS "BetterAuthVerification_identifier_idx" ON "BetterAuthVerification"("identifier");

-- Migrate existing UserPassword hashes into Account table as credential provider rows.
-- better-auth looks up passwords from Account.password for email/password sign-in.
INSERT INTO "Account" (id, "userId", type, provider, "providerAccountId", password, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  up."userId",
  'credential',
  'credential',
  u.email,
  up.hash,
  NOW(),
  NOW()
FROM "UserPassword" up
JOIN users u ON u.id = up."userId"
WHERE NOT EXISTS (
  SELECT 1 FROM "Account" a
  WHERE a."userId" = up."userId"
  AND a.provider = 'credential'
);
