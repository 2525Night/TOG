import { Module } from "@nestjs/common";
import { BudgetService } from "./budget.service";
import { BudgetController } from "./budget.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [BudgetService],
  controllers: [BudgetController],
  exports: [BudgetService],
})
export class BudgetModule {}
