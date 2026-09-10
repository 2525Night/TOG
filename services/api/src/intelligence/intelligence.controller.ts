import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { IntelligenceService } from "./intelligence.service";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";

@Controller()
@UseGuards(JwtAuthGuard)
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  @Get("reports/overview")
  report(
    @CurrentUser() user: AuthUser,
    @Query("months") months?: string,
    @Query("month") month?: string,
  ) {
    const monthsBack = Math.min(24, Math.max(2, Number(months) || 6));
    return this.intelligence.buildReport(
      user.ledgerUserId,
      monthsBack,
      month || undefined,
    );
  }

  @Get("reports/overview.csv")
  async exportCsv(
    @CurrentUser() user: AuthUser,
    @Query("month") month: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.intelligence.exportBalanceCsv(
      user.ledgerUserId,
      month || undefined,
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="moneytail-balance.csv"',
    );
    res.send(csv);
  }

  @Get("insights/analysis")
  analysis(
    @CurrentUser() user: AuthUser,
    @Query("month") month?: string,
  ) {
    return this.intelligence.analyze(user.ledgerUserId, month || undefined);
  }

  @Post("alerts/:id/dismiss")
  dismiss(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.intelligence.dismissAlert(user.ledgerUserId, id);
  }

  @Post("alerts/:id/snooze")
  snooze(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.intelligence.snoozeAlert(user.ledgerUserId, id, 7);
  }
}
