import { Module } from "@nestjs/common";
import { DashboardModule } from "../dashboard/dashboard.module";
import { BudgetModule } from "../budget/budget.module";
import { GoalsModule } from "../goals/goals.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TransactionsModule } from "../transactions/transactions.module";
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
  ],
  controllers: [RoeyController],
  exports: [RoeyService],
})
export class RoeyModule {}
