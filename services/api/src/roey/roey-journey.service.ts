import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  RoeyJourney,
  RoeyJourneyStage,
} from "./roey.types";

type JourneyInput = {
  createdAt: Date;
  onboardingCompleted: boolean;
  transactions: Array<{ bookedAt: Date; direction: string }>;
  now?: Date;
};

@Injectable()
export class RoeyJourneyService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string): Promise<RoeyJourney> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, onboardingCompleted: true },
    });
    if (!user) throw new UnauthorizedException();

    const since = new Date();
    since.setMonth(since.getMonth() - 13);
    const transactions = await this.prisma.transaction.findMany({
      where: { userId, bookedAt: { gte: since } },
      select: { bookedAt: true, direction: true },
      orderBy: { bookedAt: "asc" },
    });
    return deriveRoeyJourney({ ...user, transactions });
  }
}

export function deriveRoeyJourney(input: JourneyInput): RoeyJourney {
  const now = input.now ?? new Date();
  const currentMonth = monthKey(now);
  const groups = new Map<
    string,
    { count: number; hasIncome: boolean; lastAt: Date }
  >();

  for (const tx of input.transactions) {
    const key = monthKey(tx.bookedAt);
    const existing = groups.get(key) ?? {
      count: 0,
      hasIncome: false,
      lastAt: tx.bookedAt,
    };
    existing.count += 1;
    existing.hasIncome ||= tx.direction === "INCOME";
    if (tx.bookedAt > existing.lastAt) existing.lastAt = tx.bookedAt;
    groups.set(key, existing);
  }

  const completedMonths = [...groups.entries()].filter(
    ([key, group]) => key !== currentMonth && group.count > 0,
  ).length;
  const reliableMonths = [...groups.values()].filter(
    (group) => group.count >= 3 && group.hasIncome,
  ).length;
  const lastActivity = input.transactions.at(-1)?.bookedAt ?? null;
  const daysSinceRegistration = daysBetween(input.createdAt, now);
  const daysSinceLastActivity = lastActivity
    ? daysBetween(lastActivity, now)
    : null;

  let stage: RoeyJourneyStage;
  if (
    !input.onboardingCompleted ||
    (completedMonths === 0 && daysSinceRegistration <= 45)
  ) {
    stage = "INTRODUCTION";
  } else if (
    completedMonths > 0 &&
    daysSinceLastActivity != null &&
    daysSinceLastActivity > 60
  ) {
    stage = "RETURNING";
  } else if (reliableMonths < 2) {
    stage = "BASELINE";
  } else {
    stage = "ESTABLISHED";
  }

  const copy = stageCopy(stage);
  return {
    stage,
    ...copy,
    completedMonths,
    reliableMonths,
    daysSinceRegistration,
    daysSinceLastActivity,
    signalsReliable: reliableMonths >= 1,
  };
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysBetween(from: Date, to: Date) {
  return Math.max(
    0,
    Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1_000)),
  );
}

function stageCopy(stage: RoeyJourneyStage) {
  switch (stage) {
    case "INTRODUCTION":
      return {
        titleHe: "מתחילים להכיר",
        messageHe:
          "אנחנו בתחילת ההיכרות עם הנתונים שלך. אבנה איתך תמונת בסיס לפני מסקנות חזקות.",
      };
    case "BASELINE":
      return {
        titleHe: "בונים תמונת בסיס",
        messageHe:
          "כבר יש מידע ראשוני, אך עדיין חסרה היסטוריה מספקת להשוואה אמינה.",
      };
    case "RETURNING":
      return {
        titleHe: "חוזרים למסלול",
        messageHe:
          "עבר זמן מאז העדכון האחרון. נבדוק מה השתנה לפני שנעדכן את המסלול.",
      };
    case "ESTABLISHED":
      return {
        titleHe: "מסע מבוסס",
        messageHe:
          "יש מספיק היסטוריה כדי לזהות מגמות ולהציע צעדים מבוססי נתונים.",
      };
  }
}
