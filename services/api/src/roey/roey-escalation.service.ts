import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { RoeyIntent } from "./roey-runtime.types";

@Injectable()
export class RoeyEscalationService {
  constructor(private readonly prisma: PrismaService) {}

  async createForTurn(input: {
    userId: string;
    conversationId: string | null;
    runId: string;
    intent: Extract<RoeyIntent, "VULNERABILITY" | "REGULATED" | "DISPUTE">;
    message: string;
    factIds: string[];
  }) {
    const policy = escalationPolicy(input.intent, input.message);
    const row = await this.prisma.roeyEscalation.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        runId: input.runId,
        type: policy.type,
        urgency: policy.urgency,
        summaryHe: policy.summaryHe,
        evidenceFactIdsJson: JSON.stringify(input.factIds),
        unresolvedJson: JSON.stringify(policy.unresolvedHe),
      },
    });
    await this.prisma.auditEvent.create({
      data: {
        userId: input.userId,
        action: "ROEY_ESCALATION_CREATED",
        meta: JSON.stringify({
          escalationId: row.id,
          type: row.type,
          urgency: row.urgency,
          runId: input.runId,
        }),
      },
    });
    return {
      escalation: row,
      responseHe: policy.responseHe,
    };
  }

  list(userId: string) {
    return this.prisma.roeyEscalation.findMany({
      where: { userId, status: "OPEN" },
      orderBy: [{ urgency: "asc" }, { createdAt: "desc" }],
      take: 20,
    });
  }

  async approveHandoff(userId: string, id: string) {
    const row = await this.requireEscalation(userId, id);
    const updated = await this.prisma.roeyEscalation.update({
      where: { id: row.id },
      data: { userApprovedHandoff: true, status: "HANDOFF_REQUESTED" },
    });
    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: "ROEY_ESCALATION_HANDOFF_APPROVED",
        meta: JSON.stringify({ escalationId: id }),
      },
    });
    return updated;
  }

  async dismiss(userId: string, id: string) {
    const row = await this.requireEscalation(userId, id);
    await this.prisma.roeyEscalation.update({
      where: { id: row.id },
      data: { status: "DISMISSED", resolvedAt: new Date() },
    });
    return { ok: true };
  }

  private requireEscalation(userId: string, id: string) {
    return this.prisma.roeyEscalation
      .findFirst({ where: { id, userId } })
      .then((row) => {
        if (!row) throw new NotFoundException("בקשת ההסלמה לא נמצאה");
        return row;
      });
  }
}

function escalationPolicy(intent: string, message: string) {
  if (intent === "VULNERABILITY") {
    const immediate = /עכשיו|מייד|מאיים|אלימות|התאבד|פרצו/i.test(message);
    return {
      type: "VULNERABILITY",
      urgency: immediate ? "URGENT" : "HIGH",
      summaryHe:
        "המשתמש תיאר מצב שעשוי לכלול פגיעוּת, כפייה, הונאה או מצוקה חריפה.",
      unresolvedHe: [
        "האם קיימת סכנה מיידית?",
        "איזו עזרה מקצועית או אנושית זמינה למשתמש?",
      ],
      responseHe: immediate
        ? "זה נשמע כמו מצב שדורש עזרה אנושית מיידית. Roey לא ינסה לפתור אותו לבד. אם קיימת סכנה מיידית, פנה עכשיו לשירותי החירום או לאדם בטוח שנמצא לידך."
        : "זה מצב רגיש שלא נכון לנהל רק באמצעות סוכן אוטומטי. אני יכול לעזור לסכם את המידע, אבל מומלץ לערב אדם מקצועי או אדם שאתה סומך עליו.",
    };
  }
  if (intent === "REGULATED") {
    return {
      type: "REGULATED_GUIDANCE",
      urgency: "NORMAL",
      summaryHe:
        "הבקשה עשויה לכלול ייעוץ השקעות, מס, משפט, ביטוח או אשראי מוסדר.",
      unresolvedHe: [
        "איזה מידע כללי יעזור למשתמש להתכונן לשיחה עם בעל מקצוע?",
      ],
      responseHe:
        "אני יכול להסביר מושגים ולעזור לארגן שאלות, אבל לא לתת המלצה אישית בתחום מוסדר כאילו אני בעל רישיון. להחלטה אישית כדאי לפנות לבעל מקצוע מתאים.",
    };
  }
  return {
    type: "DATA_DISPUTE",
    urgency: "NORMAL",
    summaryHe:
      "המשתמש חולק על נתון או תוצאה ואין כרגע מספיק ראיות ליישוב הפער.",
    unresolvedHe: [
      "מהו הערך שהמשתמש רואה בפועל?",
      "לאיזה תאריך מתייחס הערך?",
      "האם חסרות תנועות או יתרת פתיחה?",
    ],
    responseHe:
      "אני רואה שיש פער בין הנתון במערכת לבין מה שאתה מצפה לראות. לא אשנה אותו על סמך הנחה. נצטרך את הערך שנצפה בפועל, התאריך והמקור כדי לבצע התאמה מתועדת.",
  };
}
