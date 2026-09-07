import { Module } from "@nestjs/common";
import { BudgetService } from "./budget.service";
import { BudgetController } from "./budget.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { MonthFactsModule } from "../month-facts/month-facts.module";

@Module({
  imports: [PrismaModule, MonthFactsModule],
  providers: [BudgetService],
  controllers: [BudgetController],
  exports: [BudgetService],
})
export class BudgetModule {}
