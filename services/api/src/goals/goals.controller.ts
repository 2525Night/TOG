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
import { GoalsService } from "./goals.service";
import {
  ApplyStandingRangeDto,
  ApplySurplusDto,
  CreateGoalDto,
  CreateStandingDto,
  ReverseAllocationDto,
  UpdateGoalDto,
} from "./goals.dto";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";

@Controller("goals")
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("month") month?: string) {
    return this.goals.list(user.ledgerUserId, month || undefined);
  }

  @Get("month-pool")
  monthPool(@CurrentUser() user: AuthUser, @Query("month") month?: string) {
    return this.goals.monthPool(user.ledgerUserId, month || undefined);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGoalDto) {
    return this.goals.create(user.ledgerUserId, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.goals.update(user.ledgerUserId, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.goals.remove(user.ledgerUserId, id);
  }

  @Post(":id/apply-surplus")
  applySurplus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: ApplySurplusDto,
  ) {
    return this.goals.applySurplus(user.ledgerUserId, id, dto);
  }

  @Post(":id/reverse-allocation")
  reverseAllocation(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: ReverseAllocationDto,
  ) {
    return this.goals.reverseAllocation(user.ledgerUserId, id, dto);
  }

  @Post(":id/standing")
  createStanding(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: CreateStandingDto,
  ) {
    return this.goals.createStanding(user.ledgerUserId, id, dto);
  }

  @Post(":id/standing/apply-range")
  applyStandingRange(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: ApplyStandingRangeDto,
  ) {
    return this.goals.applyStandingRange(user.ledgerUserId, id, dto);
  }

  @Post(":id/standing/stop")
  stopStanding(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.goals.stopStanding(user.ledgerUserId, id);
  }
}
