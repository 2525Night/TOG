import { Module } from "@nestjs/common";
import { LoansService } from "./loans.service";
import { LoansController } from "./loans.controller";
import { MonthFactsModule } from "../month-facts/month-facts.module";

@Module({
  imports: [MonthFactsModule],
  providers: [LoansService],
  controllers: [LoansController],
  exports: [LoansService],
})
export class LoansModule {}
