-- AlterTable
ALTER TABLE "RoeyConversation" ADD COLUMN "summaryHe" TEXT;
ALTER TABLE "RoeyConversation" ADD COLUMN "summaryUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RoeyActionProposal" ADD COLUMN "runId" TEXT;

-- CreateTable
CREATE TABLE "UserFinancialPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "objectiveHe" TEXT NOT NULL,
    "motivationHe" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'STABILITY',
    "horizonMonths" INTEGER,
    "riskCapacity" TEXT NOT NULL DEFAULT 'CONSERVATIVE',
    "nextActionHe" TEXT,
    "assumptionsJson" TEXT,
    "reviewTriggersJson" TEXT,
    "reviewAt" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFinancialPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPlanMilestone" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "titleHe" TEXT NOT NULL,
    "targetAmount" DECIMAL(65,30),
    "targetDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialPlanMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPlanConstraint" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "labelHe" TEXT NOT NULL,
    "valueJson" TEXT,
    "hard" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialPlanConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPlanEvent" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "summaryHe" TEXT NOT NULL,
    "reasonHe" TEXT,
    "changesJson" TEXT,
    "source" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialPlanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoeyAgentRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "planId" TEXT,
    "runtimeVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "modelId" TEXT,
    "intent" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "contextHash" TEXT,
    "maxModelCalls" INTEGER NOT NULL DEFAULT 3,
    "maxToolCalls" INTEGER NOT NULL DEFAULT 5,
    "modelCalls" INTEGER NOT NULL DEFAULT 0,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "citedFactIdsJson" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoeyAgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoeyAgentTraceSpan" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputHash" TEXT,
    "outputHash" TEXT,
    "metadataJson" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RoeyAgentTraceSpan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoeySemanticMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "sourceConversationId" TEXT,
    "sourceMessageId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "userConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoeySemanticMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoeyClaimEvidence" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "messageId" TEXT,
    "factId" TEXT NOT NULL,
    "claimHe" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoeyClaimEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoeyOutcomeReconciliation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "proposalId" TEXT,
    "forecastRunId" TEXT,
    "type" TEXT NOT NULL,
    "expectedJson" TEXT NOT NULL,
    "actualJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "varianceJson" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoeyOutcomeReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoeyEscalation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "runId" TEXT,
    "type" TEXT NOT NULL,
    "urgency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "summaryHe" TEXT NOT NULL,
    "evidenceFactIdsJson" TEXT,
    "unresolvedJson" TEXT,
    "userApprovedHandoff" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoeyEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserFinancialPlan_userId_key" ON "UserFinancialPlan"("userId");

-- CreateIndex
CREATE INDEX "FinancialPlanMilestone_planId_position_idx" ON "FinancialPlanMilestone"("planId", "position");

-- CreateIndex
CREATE INDEX "FinancialPlanConstraint_planId_type_idx" ON "FinancialPlanConstraint"("planId", "type");

-- CreateIndex
CREATE INDEX "FinancialPlanEvent_planId_createdAt_idx" ON "FinancialPlanEvent"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "RoeyAgentRun_userId_createdAt_idx" ON "RoeyAgentRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RoeyAgentRun_conversationId_idx" ON "RoeyAgentRun"("conversationId");

-- CreateIndex
CREATE INDEX "RoeyAgentTraceSpan_runId_startedAt_idx" ON "RoeyAgentTraceSpan"("runId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoeySemanticMemory_userId_key_key" ON "RoeySemanticMemory"("userId", "key");

-- CreateIndex
CREATE INDEX "RoeySemanticMemory_userId_status_idx" ON "RoeySemanticMemory"("userId", "status");

-- CreateIndex
CREATE INDEX "RoeyClaimEvidence_runId_idx" ON "RoeyClaimEvidence"("runId");

-- CreateIndex
CREATE INDEX "RoeyClaimEvidence_messageId_idx" ON "RoeyClaimEvidence"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "RoeyOutcomeReconciliation_proposalId_key" ON "RoeyOutcomeReconciliation"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "RoeyOutcomeReconciliation_forecastRunId_key" ON "RoeyOutcomeReconciliation"("forecastRunId");

-- CreateIndex
CREATE INDEX "RoeyOutcomeReconciliation_userId_status_dueAt_idx" ON "RoeyOutcomeReconciliation"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "RoeyOutcomeReconciliation_proposalId_idx" ON "RoeyOutcomeReconciliation"("proposalId");

-- CreateIndex
CREATE INDEX "RoeyEscalation_userId_status_createdAt_idx" ON "RoeyEscalation"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RoeyActionProposal_runId_idx" ON "RoeyActionProposal"("runId");

-- AddForeignKey
ALTER TABLE "UserFinancialPlan" ADD CONSTRAINT "UserFinancialPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPlanMilestone" ADD CONSTRAINT "FinancialPlanMilestone_planId_fkey" FOREIGN KEY ("planId") REFERENCES "UserFinancialPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPlanConstraint" ADD CONSTRAINT "FinancialPlanConstraint_planId_fkey" FOREIGN KEY ("planId") REFERENCES "UserFinancialPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPlanEvent" ADD CONSTRAINT "FinancialPlanEvent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "UserFinancialPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoeyAgentRun" ADD CONSTRAINT "RoeyAgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoeyAgentTraceSpan" ADD CONSTRAINT "RoeyAgentTraceSpan_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RoeyAgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoeySemanticMemory" ADD CONSTRAINT "RoeySemanticMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoeyEscalation" ADD CONSTRAINT "RoeyEscalation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
