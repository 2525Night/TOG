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
import { LoansService } from "./loans.service";
import { CreateLoanDto, UpdateLoanDto } from "./loans.dto";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";

@Controller("loans")
@UseGuards(JwtAuthGuard)
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("month") month?: string) {
    return this.loans.list(user.ledgerUserId, month || undefined);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.loans.get(user.ledgerUserId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLoanDto) {
    return this.loans.create(user.ledgerUserId, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateLoanDto,
  ) {
    return this.loans.update(user.ledgerUserId, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.loans.remove(user.ledgerUserId, id);
  }
}
