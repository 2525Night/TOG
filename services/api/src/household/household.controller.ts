import { Body, Controller, Delete, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";
import { HouseholdService } from "./household.service";
import {
  CreateHouseholdInviteDto,
  RedeemHouseholdDto,
} from "./household.dto";

@Controller("household")
@UseGuards(JwtAuthGuard)
export class HouseholdController {
  constructor(private readonly household: HouseholdService) {}

  @Get("status")
  status(@CurrentUser() user: AuthUser) {
    return this.household.status(user.userId);
  }

  @Post("invite")
  invite(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHouseholdInviteDto,
  ) {
    return this.household.createInvite(user.userId, dto);
  }

  @Post("redeem")
  redeem(@CurrentUser() user: AuthUser, @Body() dto: RedeemHouseholdDto) {
    return this.household.redeem(user.userId, dto.code);
  }

  @Delete("link")
  unlink(@CurrentUser() user: AuthUser) {
    return this.household.unlink(user.userId);
  }
}
