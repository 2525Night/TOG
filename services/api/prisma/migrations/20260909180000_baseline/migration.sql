-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('CASH', 'BANK', 'CREDIT_CARD', 'LOAN', 'INVESTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TxDirection" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('USER_INPUT', 'CHAT', 'FILE_UPLOAD', 'DOCUMENT_EXTRACTION', 'CALCULATION', 'AI_INFERENCE', 'MARKET_DATA', 'BANK_API', 'CREDIT_CARD_API', 'INSURANCE_API');

-- CreateEnum
CREATE TYPE "EconomicRole" AS ENUM ('STANDARD', 'CARD_PURCHASE', 'CARD_SETTLEMENT', 'LOAN_PAYMENT');

-- CreateEnum
CREATE TYPE "GoalKind" AS ENUM ('GENERAL', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "DocStorageMode" AS ENUM ('TEMPORARY', 'PERMANENT');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('UPLOADED', 'EXTRACTED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommitmentNature" AS ENUM ('FIXED', 'PERIODIC');

-- CreateEnum
CREATE TYPE "CommitmentCadence" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "CommitmentPayVia" AS ENUM ('ACCOUNT', 'CREDIT_CARD');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "jurisdiction" TEXT NOT NULL DEFAULT 'IL',
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL DEFAULT 'CASH',
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "currentBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceType" "SourceType" NOT NULL DEFAULT 'USER_INPUT',
    "sourceProvider" TEXT,
    "userConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "direction" "TxDirection" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "categoryKey" TEXT NOT NULL,
    "description" TEXT,
    "note" TEXT,
    "merchantNorm" TEXT,
    "bookedAt" TIMESTAMP(3) NOT NULL,
    "sourceType" "SourceType" NOT NULL DEFAULT 'USER_INPUT',
    "sourceProvider" TEXT,
    "sourceReference" TEXT,
    "confidence" DOUBLE PRECISION,
    "userConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "economicRole" "EconomicRole" NOT NULL DEFAULT 'STANDARD',
    "loanId" TEXT,
    "creditCardId" TEXT,
    "installmentPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "GoalKind" NOT NULL DEFAULT 'GENERAL',
    "targetAmount" DECIMAL(65,30) NOT NULL,
    "currentAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "targetDate" TIMESTAMP(3),
    "sourceType" "SourceType" NOT NULL DEFAULT 'USER_INPUT',
    "userConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "originalAmount" DECIMAL(65,30) NOT NULL,
    "principalBalance" DECIMAL(65,30) NOT NULL,
    "monthlyPayment" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "aprPercent" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3),
    "linkedCommitmentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "lastFour" TEXT,
    "creditLimit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "billingDay" INTEGER,
    "nextBillingDate" TIMESTAMP(3),
    "linkedCommitmentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "titleHe" TEXT NOT NULL,
    "originalAmount" DECIMAL(65,30) NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "installmentAmount" DECIMAL(65,30) NOT NULL,
    "chargedCount" INTEGER NOT NULL DEFAULT 0,
    "startMonth" TEXT NOT NULL,
    "linkedPurchaseTxId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "titleHe" TEXT NOT NULL,
    "bodyHe" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL DEFAULT 'csv',
    "storageMode" "DocStorageMode" NOT NULL DEFAULT 'TEMPORARY',
    "status" "DocStatus" NOT NULL DEFAULT 'UPLOADED',
    "filePath" TEXT,
    "rawText" TEXT,
    "draftJson" TEXT,
    "importedCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetCommitment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titleHe" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "merchantNorm" TEXT,
    "nature" "CommitmentNature" NOT NULL DEFAULT 'FIXED',
    "expectedAmount" DECIMAL(65,30) NOT NULL,
    "cadence" "CommitmentCadence" NOT NULL DEFAULT 'MONTHLY',
    "payVia" "CommitmentPayVia" NOT NULL DEFAULT 'ACCOUNT',
    "creditCardId" TEXT,
    "anchorDay" INTEGER,
    "startMonth" TEXT,
    "endMonth" TEXT,
    "untilGoal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceType" "SourceType" NOT NULL DEFAULT 'USER_INPUT',
    "userConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBudgetSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flexibleCap" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBudgetSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelHe" TEXT NOT NULL,
    "nature" TEXT NOT NULL DEFAULT 'variable',
    "direction" TEXT NOT NULL DEFAULT 'EXPENSE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoeyProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "primaryGoal" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'BALANCED',
    "assertiveness" TEXT NOT NULL DEFAULT 'ASSERTIVE',
    "notificationMode" TEXT NOT NULL DEFAULT 'IMPORTANT_ONLY',
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onboardingSeen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoeyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoeyAiConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'GOOGLE_AI_STUDIO',
    "encryptedCredential" TEXT NOT NULL,
    "credentialKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "keyHint" TEXT NOT NULL,
    "modelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "consentVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoeyAiConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoeyConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titleHe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoeyConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoeyMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "contentHe" TEXT NOT NULL,
    "severity" TEXT,
    "confidence" TEXT,
    "sourcesJson" TEXT,
    "payloadJson" TEXT,
    "modelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoeyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoeyActionProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payloadJson" TEXT NOT NULL,
    "previewJson" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "requiresDoubleConfirm" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "resultJson" TEXT,
    "errorHe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoeyActionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketDataSnapshot" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MARKET_DATA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketDataSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoeyNudge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "titleHe" TEXT NOT NULL,
    "bodyHe" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "href" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "snoozedUntil" TIMESTAMP(3),
    "sourceJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoeyNudge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "FinancialAccount_userId_idx" ON "FinancialAccount"("userId");

-- CreateIndex
CREATE INDEX "Transaction_userId_bookedAt_idx" ON "Transaction"("userId", "bookedAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_categoryKey_idx" ON "Transaction"("userId", "categoryKey");

-- CreateIndex
CREATE INDEX "Transaction_userId_merchantNorm_idx" ON "Transaction"("userId", "merchantNorm");

-- CreateIndex
CREATE INDEX "Transaction_userId_sourceReference_idx" ON "Transaction"("userId", "sourceReference");

-- CreateIndex
CREATE INDEX "Transaction_userId_loanId_idx" ON "Transaction"("userId", "loanId");

-- CreateIndex
CREATE INDEX "Transaction_userId_creditCardId_idx" ON "Transaction"("userId", "creditCardId");

-- CreateIndex
CREATE INDEX "Transaction_userId_economicRole_idx" ON "Transaction"("userId", "economicRole");

-- CreateIndex
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");

-- CreateIndex
CREATE INDEX "Goal_userId_kind_idx" ON "Goal"("userId", "kind");

-- CreateIndex
CREATE INDEX "Loan_userId_active_idx" ON "Loan"("userId", "active");

-- CreateIndex
CREATE INDEX "Loan_linkedCommitmentId_idx" ON "Loan"("linkedCommitmentId");

-- CreateIndex
CREATE INDEX "CreditCard_userId_active_idx" ON "CreditCard"("userId", "active");

-- CreateIndex
CREATE INDEX "CreditCard_linkedCommitmentId_idx" ON "CreditCard"("linkedCommitmentId");

-- CreateIndex
CREATE INDEX "InstallmentPlan_userId_active_idx" ON "InstallmentPlan"("userId", "active");

-- CreateIndex
CREATE INDEX "InstallmentPlan_creditCardId_active_idx" ON "InstallmentPlan"("creditCardId", "active");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_userId_dismissed_idx" ON "Alert"("userId", "dismissed");

-- CreateIndex
CREATE INDEX "Alert_userId_type_idx" ON "Alert"("userId", "type");

-- CreateIndex
CREATE INDEX "Document_userId_createdAt_idx" ON "Document"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BudgetCommitment_userId_active_idx" ON "BudgetCommitment"("userId", "active");

-- CreateIndex
CREATE INDEX "BudgetCommitment_userId_categoryKey_idx" ON "BudgetCommitment"("userId", "categoryKey");

-- CreateIndex
CREATE INDEX "BudgetCommitment_creditCardId_idx" ON "BudgetCommitment"("creditCardId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBudgetSettings_userId_key" ON "UserBudgetSettings"("userId");

-- CreateIndex
CREATE INDEX "UserCategory_userId_direction_idx" ON "UserCategory"("userId", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "UserCategory_userId_key_key" ON "UserCategory"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "RoeyProfile_userId_key" ON "RoeyProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoeyAiConnection_userId_key" ON "RoeyAiConnection"("userId");

-- CreateIndex
CREATE INDEX "RoeyConversation_userId_updatedAt_idx" ON "RoeyConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "RoeyMessage_conversationId_createdAt_idx" ON "RoeyMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "RoeyMessage_userId_createdAt_idx" ON "RoeyMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RoeyActionProposal_userId_status_createdAt_idx" ON "RoeyActionProposal"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RoeyActionProposal_conversationId_idx" ON "RoeyActionProposal"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketDataSnapshot_key_key" ON "MarketDataSnapshot"("key");

-- CreateIndex
CREATE INDEX "RoeyNudge_userId_status_updatedAt_idx" ON "RoeyNudge"("userId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoeyNudge_userId_key_key" ON "RoeyNudge"("userId", "key");

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_installmentPlanId_fkey" FOREIGN KEY ("installmentPlanId") REFERENCES "InstallmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_linkedCommitmentId_fkey" FOREIGN KEY ("linkedCommitmentId") REFERENCES "BudgetCommitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_linkedCommitmentId_fkey" FOREIGN KEY ("linkedCommitmentId") REFERENCES "BudgetCommitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetCommitment" ADD CONSTRAINT "BudgetCommitment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetCommitment" ADD CONSTRAINT "BudgetCommitment_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBudgetSettings" ADD CONSTRAINT "UserBudgetSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCategory" ADD CONSTRAINT "UserCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoeyProfile" ADD CONSTRAINT "RoeyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoeyAiConnection" ADD CONSTRAINT "RoeyAiConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoeyConversation" ADD CONSTRAINT "RoeyConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoeyMessage" ADD CONSTRAINT "RoeyMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoeyMessage" ADD CONSTRAINT "RoeyMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "RoeyConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoeyActionProposal" ADD CONSTRAINT "RoeyActionProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoeyNudge" ADD CONSTRAINT "RoeyNudge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

