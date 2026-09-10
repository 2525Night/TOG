import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";

@Controller("dashboard")
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("summary")
  summary(
    @CurrentUser() user: AuthUser,
    @Query("month") month?: string,
  ) {
    return this.dashboard.summary(user.ledgerUserId, month);
  }
}
