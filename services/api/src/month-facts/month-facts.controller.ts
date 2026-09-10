import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";
import { MonthFactsService } from "./month-facts.service";

@Controller("month-facts")
@UseGuards(JwtAuthGuard)
export class MonthFactsController {
  constructor(private readonly monthFacts: MonthFactsService) {}

  @Get()
  forMonth(
    @CurrentUser() user: AuthUser,
    @Query("month") month?: string,
  ) {
    return this.monthFacts.forMonth(user.ledgerUserId, month);
  }

  @Get("vocab")
  vocab() {
    return this.monthFacts.vocab();
  }
}
