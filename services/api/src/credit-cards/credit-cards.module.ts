import { Module } from "@nestjs/common";
import { CreditCardsService } from "./credit-cards.service";
import { CreditCardsController } from "./credit-cards.controller";
import { TransactionsModule } from "../transactions/transactions.module";
import { MonthFactsModule } from "../month-facts/month-facts.module";

@Module({
  imports: [TransactionsModule, MonthFactsModule],
  providers: [CreditCardsService],
  controllers: [CreditCardsController],
  exports: [CreditCardsService],
})
export class CreditCardsModule {}
