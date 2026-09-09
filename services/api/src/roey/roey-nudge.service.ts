import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoeyContextService } from "./roey-context.service";

@Injectable()
export class RoeyNudgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RoeyContextService,
  ) {}

  async list(userId: string) {
    const profile = await this.prisma.roeyProfile.findUnique({
      where: { userId },
    });
    if (profile?.notificationMode === "OFF") return [];

    await this.refresh(userId, profile?.notificationMode || "IMPORTANT_ONLY");
    const now = new Date();
    await this.prisma.roeyNudge.updateMany({
      where: {
        userId,
        status: "SNOOZED",
        snoozedUntil: { lte: now },
      },
      data: { status: "OPEN", snoozedUntil: null },
    });
    return this.prisma.roeyNudge.findMany({
      where: { userId, status: "OPEN" },
      orderBy: [{ severity: "asc" }, { updatedAt: "desc" }],
      take: 10,
    });
  }

  async dismiss(userId: string, id: string) {
    const row = await this.requireNudge(userId, id);
    await this.prisma.roeyNudge.update({
      where: { id: row.id },
      data: { status: "DISMISSED", snoozedUntil: null },
    });
    await this.audit(userId, "ROEY_NUDGE_DISMISSED", { nudgeId: id });
    return { ok: true };
  }

  async snooze(userId: string, id: string, days = 7) {
    const row = await this.requireNudge(userId, id);
    const snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1_000);
    await this.prisma.roeyNudge.update({
      where: { id: row.id },
      data: { status: "SNOOZED", snoozedUntil },
    });
    await this.audit(userId, "ROEY_NUDGE_SNOOZED", {
      nudgeId: id,
      snoozedUntil: snoozedUntil.toISOString(),
    });
    return { ok: true, snoozedUntil };
  }

  private async refresh(userId: string, mode: string) {
    const built = await this.context.build(userId);
    const month = built.context.requestedMonth;

    if (built.risk.severity !== "INFO") {
      await this.upsertWithoutReopening(userId, {
        key: `cashflow-risk-${month}`,
        titleHe: built.risk.titleHe,
        bodyHe: built.risk.messageHe,
        severity: built.risk.severity,
        href: "/app/roey",
        sourceJson: JSON.stringify({
          source: "RoeyForecastService",
          amountIls: built.risk.amountIls,
          horizonDays: built.risk.horizonDays,
        }),
      });
    }

    if (mode === "WEEKLY") {
      const base = built.forecast.scenarios.find(
        (scenario) => scenario.id === "BASE",
      );
      const day30 = base?.points.find((point) => point.days === 30);
      await this.upsertWithoutReopening(userId, {
        key: `weekly-${weekKey(new Date())}`,
        titleHe: "סיכום שבועי מ-Roey",
        bodyHe:
          day30 != null
            ? `בתרחיש הבסיס, הזמין בעוד 30 יום הוא ${formatIls(day30.projectedAvailable)}.`
            : built.journey.messageHe,
        severity: "INFO",
        href: "/app/roey",
        sourceJson: JSON.stringify({
          source: "RoeyForecastService",
          computedAt: built.forecast.computedAt,
        }),
      });
    }
  }

  private async upsertWithoutReopening(
    userId: string,
    data: {
      key: string;
      titleHe: string;
      bodyHe: string;
      severity: string;
      href: string;
      sourceJson: string;
    },
  ) {
    const existing = await this.prisma.roeyNudge.findUnique({
      where: { userId_key: { userId, key: data.key } },
    });
    if (existing) {
      const escalated =
        severityRank(data.severity) > severityRank(existing.severity);
      await this.prisma.roeyNudge.update({
        where: { id: existing.id },
        data: {
          titleHe: data.titleHe,
          bodyHe: data.bodyHe,
          severity: data.severity,
          href: data.href,
          sourceJson: data.sourceJson,
          ...(escalated ? { status: "OPEN", snoozedUntil: null } : {}),
        },
      });
      return;
    }
    await this.prisma.roeyNudge.create({ data: { userId, ...data } });
  }

  private requireNudge(userId: string, id: string) {
    return this.prisma.roeyNudge
      .findFirst({ where: { id, userId } })
      .then((row) => {
        if (!row) throw new NotFoundException("ההתראה לא נמצאה");
        return row;
      });
  }

  private audit(
    userId: string,
    action: string,
    meta: Record<string, unknown>,
  ) {
    return this.prisma.auditEvent.create({
      data: { userId, action, meta: JSON.stringify(meta) },
    });
  }
}

function severityRank(value: string) {
  if (value === "CRITICAL") return 3;
  if (value === "WARNING") return 2;
  return 1;
}

function weekKey(date: Date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return `${date.getFullYear()}-${String(Math.floor((day + start.getDay()) / 7) + 1).padStart(2, "0")}`;
}

function formatIls(value: number) {
  return `₪${Math.round(value).toLocaleString("he-IL")}`;
}
