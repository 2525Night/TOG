import { Module } from "@nestjs/common";
import { DashboardModule } from "../dashboard/dashboard.module";
import { PrismaModule } from "../prisma/prisma.module";
import { GoogleAiStudioProvider } from "./google-ai-studio.provider";
import { RoeyContextService } from "./roey-context.service";
import { RoeyController } from "./roey.controller";
import { RoeyCryptoService } from "./roey-crypto.service";
import { RoeyForecastService } from "./roey-forecast.service";
import { RoeyJourneyService } from "./roey-journey.service";
import { RoeyService } from "./roey.service";

@Module({
  imports: [PrismaModule, DashboardModule],
  providers: [
    RoeyService,
    RoeyCryptoService,
    RoeyJourneyService,
    RoeyForecastService,
    RoeyContextService,
    GoogleAiStudioProvider,
  ],
  controllers: [RoeyController],
  exports: [RoeyService],
})
export class RoeyModule {}
