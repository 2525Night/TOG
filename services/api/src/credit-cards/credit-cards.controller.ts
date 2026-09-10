import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CreditCardsService } from "./credit-cards.service";
import {
  CreateCreditCardDto,
  CreateInstallmentPlanDto,
  RecordCardChargeDto,
  UpdateCreditCardDto,
  UpdateInstallmentPlanDto,
} from "./credit-cards.dto";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";

@Controller("credit-cards")
@UseGuards(JwtAuthGuard)
export class CreditCardsController {
  constructor(private readonly cards: CreditCardsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("month") month?: string) {
    return this.cards.list(user.ledgerUserId, month || undefined);
  }

  /** Must be registered before :id routes. */
  @Post("installments/charge-due")
  chargeDueInstallments(
    @CurrentUser() user: AuthUser,
    @Query("month") month: string,
    @Query("creditCardId") creditCardId?: string,
  ) {
    return this.cards.chargeDueInstallments(
      user.ledgerUserId,
      month,
      creditCardId || undefined,
    );
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("month") month?: string,
  ) {
    return this.cards.get(user.ledgerUserId, id, month || undefined);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCreditCardDto) {
    return this.cards.create(user.ledgerUserId, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateCreditCardDto,
  ) {
    return this.cards.update(user.ledgerUserId, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.cards.remove(user.ledgerUserId, id);
  }

  @Post(":id/charges")
  recordCharge(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: RecordCardChargeDto,
  ) {
    return this.cards.recordCharge(user.ledgerUserId, id, dto);
  }

  @Post(":id/installments")
  createInstallment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: CreateInstallmentPlanDto,
  ) {
    return this.cards.createInstallment(user.ledgerUserId, id, dto);
  }

  @Patch(":id/installments/:planId")
  updateInstallment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("planId") planId: string,
    @Body() dto: UpdateInstallmentPlanDto,
  ) {
    return this.cards.updateInstallment(user.ledgerUserId, id, planId, dto);
  }

  @Delete(":id/installments/:planId")
  removeInstallment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("planId") planId: string,
  ) {
    return this.cards.removeInstallment(user.ledgerUserId, id, planId);
  }
}
