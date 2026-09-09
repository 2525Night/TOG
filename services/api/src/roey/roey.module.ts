import { Module } from "@nestjs/common";
import { DashboardModule } from "../dashboard/dashboard.module";
import { FinancialPlanService } from "./financial-plan.service";
import { RoeyFactRegistryService } from "./roey-fact-registry.service";
import { RoeyOrchestratorService } from "./roey-orchestrator.service";
import { RoeyToolRegistryService } from "./roey-tool-registry.service";
import { RoeyMemoryService } from "./roey-memory.service";
import { RoeyReconciliationService } from "./roey-reconciliation.service";
import { RoeyEscalationService } from "./roey-escalation.service";
import { BudgetModule } from "../budget/budget.module";
import { GoalsModule } from "../goals/goals.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TransactionsModule } from "../transactions/transactions.module";
import { MonthFactsModule } from "../month-facts/month-facts.module";
import { GoogleAiStudioProvider } from "./google-ai-studio.provider";
import { MarketDataService } from "./market-data.service";
import { RoeyActionService } from "./roey-action.service";
import { RoeyContextService } from "./roey-context.service";
import { RoeyController } from "./roey.controller";
import { RoeyCryptoService } from "./roey-crypto.service";
import { RoeyForecastService } from "./roey-forecast.service";
import { RoeyJourneyService } from "./roey-journey.service";
import { RoeyNudgeService } from "./roey-nudge.service";
import { RoeyService } from "./roey.service";

@Module({
  imports: [
    PrismaModule,
    DashboardModule,
    TransactionsModule,
    BudgetModule,
    GoalsModule,
    MonthFactsModule,
  ],
  providers: [
    RoeyService,
    RoeyActionService,
    RoeyCryptoService,
    RoeyJourneyService,
    RoeyForecastService,
    RoeyContextService,
    GoogleAiStudioProvider,
    MarketDataService,
    RoeyNudgeService,
    FinancialPlanService,
    RoeyFactRegistryService,
    RoeyOrchestratorService,
    RoeyToolRegistryService,
    RoeyMemoryService,
    RoeyReconciliationService,
    RoeyEscalationService,
  ],
  controllers: [RoeyController],
  exports: [RoeyService],
})
export class RoeyModule {}
