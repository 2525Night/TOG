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
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";
import { NotificationsService } from "./notifications.service";
import {
  CreateNotificationDto,
  UpdateNotificationPrefsDto,
} from "./notifications.dto";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("tab") tab?: string,
    @Query("unreadOnly") unreadOnly?: string,
  ) {
    return this.notifications.list(user.ledgerUserId, {
      tab: tab === "ALERTS" || tab === "UPDATES" ? tab : undefined,
      unreadOnly: unreadOnly === "1" || unreadOnly === "true",
    });
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.ledgerUserId);
  }

  @Get("prefs")
  prefs(@CurrentUser() user: AuthUser) {
    return this.notifications.getPrefs(user.ledgerUserId);
  }

  @Patch("prefs")
  updatePrefs(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateNotificationPrefsDto,
  ) {
    return this.notifications.updatePrefs(user.ledgerUserId, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateNotificationDto) {
    return this.notifications.create(user.ledgerUserId, dto);
  }

  @Post("mark-all-read")
  markAllRead(
    @CurrentUser() user: AuthUser,
    @Query("tab") tab?: string,
  ) {
    return this.notifications.markAllRead(
      user.ledgerUserId,
      tab === "ALERTS" || tab === "UPDATES" ? tab : undefined,
    );
  }

  @Post("clear-old")
  clearOld(
    @CurrentUser() user: AuthUser,
    @Query("days") days?: string,
  ) {
    const n = Number(days);
    return this.notifications.clearOld(
      user.ledgerUserId,
      Number.isFinite(n) && n > 0 ? n : 30,
    );
  }

  @Post(":id/read")
  markRead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notifications.markRead(user.ledgerUserId, id);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notifications.softDelete(user.ledgerUserId, id);
  }
}
