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
  ],
  controllers: [HealthController],
})
export class AppModule {}
