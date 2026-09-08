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
import { TransactionsService } from "./transactions.service";
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from "./transactions.dto";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";

@Controller("transactions")
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("month") month?: string,
    @Query("loanId") loanId?: string,
    @Query("creditCardId") creditCardId?: string,
  ) {
    return this.transactions.list(user.userId, {
      month: month || undefined,
      loanId: loanId || undefined,
      creditCardId: creditCardId || undefined,
    });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTransactionDto) {
    return this.transactions.create(user.userId, dto);
  }

  @Post("bulk-by-merchant")
  bulkByMerchant(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      merchantNorm: string;
      categoryKey: string;
      direction?: "INCOME" | "EXPENSE" | "TRANSFER";
      month?: string;
      excludeId?: string;
    },
  ) {
    return this.transactions.updateByMerchant(user.userId, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactions.update(user.userId, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.transactions.remove(user.userId, id);
  }
}
