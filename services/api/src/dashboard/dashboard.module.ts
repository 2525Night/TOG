import { Module } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { DashboardController } from "./dashboard.controller";
import { IntelligenceModule } from "../intelligence/intelligence.module";
import { BudgetModule } from "../budget/budget.module";
import { MonthFactsModule } from "../month-facts/month-facts.module";

@Module({
  imports: [IntelligenceModule, BudgetModule, MonthFactsModule],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
