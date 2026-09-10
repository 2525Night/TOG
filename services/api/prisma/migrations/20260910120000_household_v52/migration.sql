-- MoneyTails5_V5.2 household sharing
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "householdOwnerId" TEXT;
CREATE INDEX IF NOT EXISTS "User_householdOwnerId_idx" ON "User"("householdOwnerId");

CREATE TABLE IF NOT EXISTS "HouseholdInvite" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelHe" TEXT,
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HouseholdInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HouseholdInvite_code_key" ON "HouseholdInvite"("code");
CREATE INDEX IF NOT EXISTS "HouseholdInvite_ownerId_idx" ON "HouseholdInvite"("ownerId");

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_householdOwnerId_fkey"
    FOREIGN KEY ("householdOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "HouseholdInvite" ADD CONSTRAINT "HouseholdInvite_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
