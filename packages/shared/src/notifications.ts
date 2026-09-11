/** Service-center notification schema (Toast · Center · OS). */

export type NotificationKind =
  | "SUCCESS"
  | "ERROR"
  | "INFO"
  | "IMPORTANT"
  | "NUDGE";

export type NotificationSource =
  | "MONEY"
  | "CASH"
  | "ROEY"
  | "DEBTS"
  | "GOALS"
  | "SETTINGS"
  | "SYSTEM";

export type NotificationCenterTab = "ALERTS" | "UPDATES";

export type NotificationEventDto = {
  id: string;
  createdAt: string;
  kind: NotificationKind;
  source: NotificationSource;
  titleHe: string;
  bodyHe: string;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  readAt?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  ttlSeconds?: number | null;
  osEligible: boolean;
  centerTab: NotificationCenterTab;
  deliveries?: {
    toast?: { shownAt?: string | null; dismissedAt?: string | null };
    center?: { tab: NotificationCenterTab };
    os?: {
      enabledByPolicy?: boolean;
      requestedAt?: string | null;
      deliveredAt?: string | null;
      notificationId?: string | null;
      channelId?: string | null;
    };
  };
};

export type NotificationPrefsDto = {
  toastEnabled: boolean;
  saveSuccessToUpdates: boolean;
  roeyNudgesInCenter: boolean;
  osNotificationsEnabled: boolean;
  osImportant: boolean;
  osNudge: boolean;
  osWeeklyDigest: boolean;
  osActionErrors: boolean;
  osSuccess: boolean;
  /** Mirrored from Roey profile when available. */
  notificationMode: "OFF" | "IMPORTANT_ONLY" | "WEEKLY";
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefsDto = {
  toastEnabled: true,
  saveSuccessToUpdates: true,
  roeyNudgesInCenter: true,
  osNotificationsEnabled: false,
  osImportant: true,
  osNudge: true,
  osWeeklyDigest: false,
  osActionErrors: false,
  osSuccess: false,
  notificationMode: "IMPORTANT_ONLY",
};

export function centerTabForKind(kind: NotificationKind): NotificationCenterTab {
  if (kind === "SUCCESS" || kind === "INFO") return "UPDATES";
  return "ALERTS";
}

export function defaultOsEligible(kind: NotificationKind): boolean {
  return kind === "IMPORTANT" || kind === "NUDGE";
}

export function defaultToastTtl(kind: NotificationKind): number {
  if (kind === "ERROR" || kind === "IMPORTANT") return 4;
  return 3;
}
