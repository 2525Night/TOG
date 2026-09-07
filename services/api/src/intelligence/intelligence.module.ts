import { Module } from "@nestjs/common";
import { IntelligenceService } from "./intelligence.service";
import { IntelligenceController } from "./intelligence.controller";
import { MonthFactsModule } from "../month-facts/month-facts.module";

@Module({
  imports: [MonthFactsModule],
  providers: [IntelligenceService],
  controllers: [IntelligenceController],
  exports: [IntelligenceService],
})
export class IntelligenceModule {}
