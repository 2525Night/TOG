import { Injectable, NotFoundException } from "@nestjs/common";
import {
  centerTabForKind,
  defaultOsEligible,
  defaultToastTtl,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationCenterTab,
  type NotificationKind,
  type NotificationPrefsDto,
} from "@moneytail/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateNotificationDto,
  UpdateNotificationPrefsDto,
} from "./notifications.dto";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapRow(row: {
    id: string;
    createdAt: Date;
    kind: string;
    source: string;
    titleHe: string;
    bodyHe: string;
    entityType: string | null;
    entityId: string | null;
    actionUrl: string | null;
    readAt: Date | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
    ttlSeconds: number | null;
    osEligible: boolean;
    centerTab: string;
    toastShownAt: Date | null;
    toastDismissedAt: Date | null;
    osRequestedAt: Date | null;
    osDeliveredAt: Date | null;
    osNotificationId: string | null;
    osChannelId: string | null;
  }) {
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      kind: row.kind as NotificationKind,
      source: row.source,
      titleHe: row.titleHe,
      bodyHe: row.bodyHe,
      entityType: row.entityType,
      entityId: row.entityId,
      actionUrl: row.actionUrl,
      readAt: row.readAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      ttlSeconds: row.ttlSeconds,
      osEligible: row.osEligible,
      centerTab: row.centerTab as NotificationCenterTab,
      deliveries: {
        toast: {
          shownAt: row.toastShownAt?.toISOString() ?? null,
          dismissedAt: row.toastDismissedAt?.toISOString() ?? null,
        },
        center: { tab: row.centerTab as NotificationCenterTab },
        os: {
          enabledByPolicy: row.osEligible,
          requestedAt: row.osRequestedAt?.toISOString() ?? null,
          deliveredAt: row.osDeliveredAt?.toISOString() ?? null,
          notificationId: row.osNotificationId,
          channelId: row.osChannelId,
        },
      },
    };
  }

  async getPrefs(userId: string): Promise<NotificationPrefsDto> {
    const [prefs, profile] = await Promise.all([
      this.prisma.notificationPrefs.findUnique({ where: { userId } }),
      this.prisma.roeyProfile.findUnique({ where: { userId } }),
    ]);
    const mode =
      profile?.notificationMode === "OFF" ||
      profile?.notificationMode === "WEEKLY" ||
      profile?.notificationMode === "IMPORTANT_ONLY"
        ? profile.notificationMode
        : DEFAULT_NOTIFICATION_PREFS.notificationMode;
    if (!prefs) {
      return { ...DEFAULT_NOTIFICATION_PREFS, notificationMode: mode };
    }
    return {
      toastEnabled: prefs.toastEnabled,
      saveSuccessToUpdates: prefs.saveSuccessToUpdates,
      roeyNudgesInCenter: prefs.roeyNudgesInCenter,
      osNotificationsEnabled: prefs.osNotificationsEnabled,
      osImportant: prefs.osImportant,
      osNudge: prefs.osNudge,
      osWeeklyDigest: prefs.osWeeklyDigest,
      osActionErrors: prefs.osActionErrors,
      osSuccess: prefs.osSuccess,
      notificationMode: mode,
    };
  }

  async updatePrefs(userId: string, dto: UpdateNotificationPrefsDto) {
    const data = {
      toastEnabled: dto.toastEnabled,
      saveSuccessToUpdates: dto.saveSuccessToUpdates,
      roeyNudgesInCenter: dto.roeyNudgesInCenter,
      osNotificationsEnabled: dto.osNotificationsEnabled,
      osImportant: dto.osImportant,
      osNudge: dto.osNudge,
      osWeeklyDigest: dto.osWeeklyDigest,
      osActionErrors: dto.osActionErrors,
      osSuccess: dto.osSuccess,
    };
    const cleaned = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    );
    await this.prisma.notificationPrefs.upsert({
      where: { userId },
      create: { userId, ...cleaned },
      update: cleaned,
    });
    return this.getPrefs(userId);
  }

  async create(userId: string, dto: CreateNotificationDto) {
    const prefs = await this.getPrefs(userId);
    const kind = dto.kind as NotificationKind;
    const centerTab = centerTabForKind(kind);
    const osEligible =
      dto.osEligible ?? defaultOsEligible(kind);

    if (kind === "SUCCESS" && !prefs.saveSuccessToUpdates && dto.toast !== false) {
      // Still allow toast-only success when center save is off
    }
    if (kind === "NUDGE" && !prefs.roeyNudgesInCenter && dto.toast === false) {
      return { skipped: true, reason: "prefs" };
    }

    const persistCenter =
      kind === "SUCCESS" || kind === "INFO"
        ? prefs.saveSuccessToUpdates
        : kind === "NUDGE"
          ? prefs.roeyNudgesInCenter
          : true;

    if (!persistCenter && dto.toast === false) {
      return { skipped: true, reason: "prefs" };
    }

    const row = await this.prisma.serviceNotification.create({
      data: {
        userId,
        kind,
        source: dto.source,
        titleHe: dto.titleHe,
        bodyHe: dto.bodyHe,
        entityType: dto.entityType,
        entityId: dto.entityId,
        actionUrl: dto.actionUrl,
        centerTab,
        osEligible,
        ttlSeconds: dto.ttlSeconds ?? defaultToastTtl(kind),
        toastShownAt: dto.toast === false ? null : new Date(),
        deletedAt: persistCenter ? null : new Date(), // toast-only → soft-hide from center
      },
    });

    return {
      ...this.mapRow(row),
      showToast: prefs.toastEnabled && dto.toast !== false,
    };
  }

  async list(
    userId: string,
    opts: { tab?: NotificationCenterTab; unreadOnly?: boolean },
  ) {
    const items = await this.prisma.serviceNotification.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(opts.tab ? { centerTab: opts.tab } : {}),
        ...(opts.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { items: items.map((r) => this.mapRow(r)) };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.serviceNotification.count({
      where: {
        userId,
        deletedAt: null,
        readAt: null,
        centerTab: "ALERTS",
      },
    });
    return { count };
  }

  async markRead(userId: string, id: string) {
    const row = await this.prisma.serviceNotification.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException("התראה לא נמצאה");
    if (!row.readAt) {
      await this.prisma.serviceNotification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    }
    const updated = await this.prisma.serviceNotification.findUniqueOrThrow({
      where: { id },
    });
    return this.mapRow(updated);
  }

  async markAllRead(userId: string, tab?: NotificationCenterTab) {
    await this.prisma.serviceNotification.updateMany({
      where: {
        userId,
        deletedAt: null,
        readAt: null,
        ...(tab ? { centerTab: tab } : {}),
      },
      data: { readAt: new Date() },
    });
    return this.unreadCount(userId);
  }

  async softDelete(userId: string, id: string) {
    const row = await this.prisma.serviceNotification.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException("התראה לא נמצאה");
    await this.prisma.serviceNotification.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  async clearOld(userId: string, days: number) {
    const cutoff = new Date(Date.now() - days * 86400000);
    const res = await this.prisma.serviceNotification.updateMany({
      where: {
        userId,
        deletedAt: null,
        readAt: { not: null },
        createdAt: { lt: cutoff },
      },
      data: { deletedAt: new Date() },
    });
    return { cleared: res.count };
  }
}
