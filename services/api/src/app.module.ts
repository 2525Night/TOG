import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { AccountsModule } from "./accounts/accounts.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { GoalsModule } from "./goals/goals.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { IntelligenceModule } from "./intelligence/intelligence.module";
import { DocumentsModule } from "./documents/documents.module";
import { BudgetModule } from "./budget/budget.module";
import { CategoriesModule } from "./categories/categories.module";
import { MonthFactsModule } from "./month-facts/month-facts.module";
import { LoansModule } from "./loans/loans.module";
import { CreditCardsModule } from "./credit-cards/credit-cards.module";
import { DebtsModule } from "./debts/debts.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    PrismaModule,
    AuthModule,
    AccountsModule,
    TransactionsModule,
    GoalsModule,
    DashboardModule,
    IntelligenceModule,
    DocumentsModule,
    BudgetModule,
    CategoriesModule,
    MonthFactsModule,
    LoansModule,
    CreditCardsModule,
    DebtsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
