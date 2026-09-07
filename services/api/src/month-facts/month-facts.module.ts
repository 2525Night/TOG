import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MonthFactsService } from "./month-facts.service";
import { MonthFactsController } from "./month-facts.controller";

@Module({
  imports: [PrismaModule],
  providers: [MonthFactsService],
  controllers: [MonthFactsController],
  exports: [MonthFactsService],
})
export class MonthFactsModule {}
