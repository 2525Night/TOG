import { Module } from "@nestjs/common";
import { IntelligenceService } from "./intelligence.service";
import { IntelligenceController } from "./intelligence.controller";

@Module({
  providers: [IntelligenceService],
  controllers: [IntelligenceController],
  exports: [IntelligenceService],
})
export class IntelligenceModule {}
