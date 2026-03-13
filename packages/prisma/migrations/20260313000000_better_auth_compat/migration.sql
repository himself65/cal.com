-- AlterTable: Add better-auth columns to Session
ALTER TABLE "Session" ADD COLUMN "ipAddress" TEXT,
                      ADD COLUMN "userAgent" TEXT,
                      ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: Add better-auth columns to Account
ALTER TABLE "Account" ADD COLUMN "password" TEXT,
                      ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
                      ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP(3),
                      ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable: BetterAuthVerification
CREATE TABLE "BetterAuthVerification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetterAuthVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BetterAuthVerification_identifier_idx" ON "BetterAuthVerification"("identifier");

-- Copy existing password hashes from UserPassword into Account as credential provider rows
INSERT INTO "Account" ("id", "userId", "type", "provider", "providerAccountId", "password", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    up."userId",
    'credential',
    'credential',
    u."email",
    up."hash",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "UserPassword" up
JOIN "users" u ON u."id" = up."userId"
WHERE NOT EXISTS (
    SELECT 1 FROM "Account" a
    WHERE a."userId" = up."userId"
      AND a."provider" = 'credential'
);
