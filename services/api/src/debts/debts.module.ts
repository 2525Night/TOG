import { Module } from "@nestjs/common";
import { DebtsOverviewController } from "./debts-overview.controller";
import { LoansModule } from "../loans/loans.module";
import { CreditCardsModule } from "../credit-cards/credit-cards.module";
import { MonthFactsModule } from "../month-facts/month-facts.module";

@Module({
  imports: [LoansModule, CreditCardsModule, MonthFactsModule],
  controllers: [DebtsOverviewController],
})
export class DebtsModule {}
