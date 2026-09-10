import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AccountsService } from "./accounts.service";
import { CreateAccountDto, UpdateAccountDto } from "./accounts.dto";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";

@Controller("accounts")
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.accounts.list(user.ledgerUserId);
  }

  /** Ensure pocket-cash account exists; returns the CASH wallet. */
  @Post("cash/ensure")
  ensureCash(@CurrentUser() user: AuthUser) {
    return this.accounts.ensureCashAccount(user.ledgerUserId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAccountDto) {
    return this.accounts.create(user.ledgerUserId, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accounts.update(user.ledgerUserId, id, dto);
  }
}
