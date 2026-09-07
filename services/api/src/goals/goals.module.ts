import { Module } from "@nestjs/common";
import { GoalsService } from "./goals.service";
import { GoalsController } from "./goals.controller";
import { BudgetModule } from "../budget/budget.module";
import { MonthFactsModule } from "../month-facts/month-facts.module";

@Module({
  imports: [BudgetModule, MonthFactsModule],
  providers: [GoalsService],
  controllers: [GoalsController],
  exports: [GoalsService],
})
export class GoalsModule {}
