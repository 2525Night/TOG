import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";
import { BudgetService } from "./budget.service";

@Controller("budget")
@UseGuards(JwtAuthGuard)
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  @Get("snapshot")
  snapshot(
    @CurrentUser() user: AuthUser,
    @Query("month") month?: string,
  ) {
    return this.budget.snapshot(user.ledgerUserId, month);
  }

  @Get("commitments")
  list(@CurrentUser() user: AuthUser) {
    return this.budget.listCommitments(user.ledgerUserId);
  }

  @Post("commitments")
  create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      titleHe: string;
      categoryKey: string;
      expectedAmount: number;
      merchantNorm?: string;
      nature?: "FIXED" | "PERIODIC";
      cadence?: "MONTHLY" | "YEARLY";
      anchorDay?: number;
      payVia?: "ACCOUNT" | "CREDIT_CARD";
      creditCardId?: string | null;
      startMonth?: string;
    },
  ) {
    return this.budget.createCommitment(user.ledgerUserId, body);
  }

  @Get("suggestions")
  suggestions(@CurrentUser() user: AuthUser) {
    return this.budget.suggestions(user.ledgerUserId);
  }

  @Post("commitments/from-suggestion")
  fromSuggestion(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      titleHe: string;
      categoryKey: string;
      merchantNorm: string;
      expectedAmount: number;
    },
  ) {
    return this.budget.confirmSuggestion(user.ledgerUserId, body);
  }

  @Post("settings/flexible-cap")
  setCap(
    @CurrentUser() user: AuthUser,
    @Body() body: { flexibleCap: number | null },
  ) {
    return this.budget.setFlexibleCap(user.ledgerUserId, body.flexibleCap ?? null);
  }

  @Post("commitments/:id/deactivate")
  deactivate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.budget.deactivateCommitment(user.ledgerUserId, id);
  }
}
