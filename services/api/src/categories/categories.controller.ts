import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";
import { CategoriesService } from "./categories.service";

@Controller("categories")
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("direction") direction?: string,
  ) {
    return this.categories.list(user.userId, direction);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      labelHe: string;
      direction?: "EXPENSE" | "INCOME";
      nature?: "fixed" | "variable" | "periodic";
    },
  ) {
    return this.categories.create(user.userId, body);
  }
}
