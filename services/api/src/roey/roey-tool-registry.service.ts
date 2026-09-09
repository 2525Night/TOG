import { Injectable } from "@nestjs/common";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from "@moneytail/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RoeyActionService } from "./roey-action.service";

type ActionToolResult = {
  proposal: Awaited<ReturnType<RoeyActionService["propose"]>> | null;
  clarificationHe: string | null;
  toolName: "PROPOSE_ACTION" | "ASK_CLARIFICATION";
};

@Injectable()
export class RoeyToolRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actions: RoeyActionService,
  ) {}

  async handleAction(
    userId: string,
    conversationId: string | null,
    message: string,
  ): Promise<ActionToolResult> {
    if (/יתרת?.{0,10}(?:עו.?ש|חשבון)|עדכן.*יתרה/i.test(message)) {
      return {
        proposal: null,
        clarificationHe:
          "אין כרגע כלי בטוח להתאמת יתרת עו״ש, ואין חיבור אוטומטי לבנק. כדי לבצע זאת נכון נדרש להזין יתרה שנצפתה ותאריך, להשוות אותה ליתרת הספרים ולאשר את ההפרש.",
        toolName: "ASK_CLARIFICATION",
      };
    }

    const amount = parseAmount(message);
    if (amount == null) {
      return {
        proposal: null,
        clarificationHe:
          "מה הסכום המדויק של הפעולה שתרצה להכין לאישור?",
        toolName: "ASK_CLARIFICATION",
      };
    }

    if (/הקצ[אה]|תעביר.*ליעד|שים.*ביעד/i.test(message)) {
      const goals = await this.prisma.goal.findMany({
        where: { userId },
        select: { id: true, title: true },
      });
      const goal =
        goals.find((item) =>
          message.toLocaleLowerCase("he").includes(
            item.title.toLocaleLowerCase("he"),
          ),
        ) ?? (goals.length === 1 ? goals[0] : null);
      if (!goal) {
        return {
          proposal: null,
          clarificationHe:
            "לאיזה יעד להקצות את הסכום? כתוב את שם היעד כפי שהוא מופיע ב-MoneyTail.",
          toolName: "ASK_CLARIFICATION",
        };
      }
      return {
        proposal: await this.actions.propose(userId, {
          type: "ALLOCATE_SURPLUS_TO_GOAL",
          conversationId: conversationId || undefined,
          payload: {
            goalId: goal.id,
            amount,
            month: monthKey(new Date()),
          },
        }),
        clarificationHe: null,
        toolName: "PROPOSE_ACTION",
      };
    }

    if (/התחייבות|הוראת קבע|מנוי|קבועה/i.test(message)) {
      const categoryKey =
        detectCategory(message, EXPENSE_CATEGORIES) || "other";
      return {
        proposal: await this.actions.propose(userId, {
          type: "CREATE_COMMITMENT",
          conversationId: conversationId || undefined,
          payload: {
            titleHe: inferTitle(message, "התחייבות חדשה"),
            categoryKey,
            expectedAmount: amount,
            cadence: /שנתי|שנתית|בשנה/i.test(message)
              ? "YEARLY"
              : "MONTHLY",
          },
        }),
        clarificationHe: null,
        toolName: "PROPOSE_ACTION",
      };
    }

    if (/קטגור/i.test(message)) {
      const categoryKey =
        detectCategory(message, [
          ...EXPENSE_CATEGORIES,
          ...INCOME_CATEGORIES,
        ]) || null;
      const recent = await this.prisma.transaction.findMany({
        where: { userId },
        orderBy: { bookedAt: "desc" },
        take: 20,
        select: { id: true, description: true },
      });
      const transaction = recent.find(
        (item) =>
          item.description &&
          message.toLocaleLowerCase("he").includes(
            item.description.toLocaleLowerCase("he"),
          ),
      );
      if (!categoryKey || !transaction) {
        return {
          proposal: null,
          clarificationHe:
            "ציין את שם התנועה ואת הקטגוריה החדשה כדי שאכין שינוי לאישור.",
          toolName: "ASK_CLARIFICATION",
        };
      }
      return {
        proposal: await this.actions.propose(userId, {
          type: "CHANGE_TRANSACTION_CATEGORY",
          conversationId: conversationId || undefined,
          payload: { transactionId: transaction.id, categoryKey },
        }),
        clarificationHe: null,
        toolName: "PROPOSE_ACTION",
      };
    }

    const direction =
      /הכנסה|משכורת|נכנס|קיבלתי/i.test(message) &&
      !/הוצאה|שילמתי|קניתי/i.test(message)
        ? "INCOME"
        : "EXPENSE";
    const categories =
      direction === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const categoryKey =
      detectCategory(message, categories) ||
      (direction === "INCOME" ? "other_income" : "other");
    return {
      proposal: await this.actions.propose(userId, {
        type: "ADD_TRANSACTION",
        conversationId: conversationId || undefined,
        payload: {
          direction,
          amount,
          categoryKey,
          bookedAt: new Date().toISOString(),
          description: inferTitle(
            message,
            direction === "INCOME" ? "הכנסה דרך Roey" : "הוצאה דרך Roey",
          ),
        },
      }),
      clarificationHe: null,
      toolName: "PROPOSE_ACTION",
    };
  }
}

function parseAmount(message: string) {
  const match =
    message.match(/(?:₪\s*)?(\d[\d,]*(?:\.\d+)?)\s*(?:₪|ש.?ח|שקל(?:ים)?)?/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function detectCategory(
  message: string,
  categories: readonly { key: string; labelHe: string }[],
) {
  const normalized = message.toLocaleLowerCase("he");
  return categories.find(
    (category) =>
      normalized.includes(category.labelHe.toLocaleLowerCase("he")) ||
      normalized.includes(category.key.toLocaleLowerCase("en")),
  )?.key;
}

function inferTitle(message: string, fallback: string) {
  const quoted = message.match(/[״"'“](.+?)[״"'”]/)?.[1]?.trim();
  if (quoted) return quoted.slice(0, 120);
  const cleaned = message
    .replace(/\d[\d,.]*/g, "")
    .replace(/₪|ש.?ח|שקלים?/gi, "")
    .replace(
      /תוסיף|הוסף|תרשום|תיצור|צור|התחייבות|הוצאה|הכנסה|חודשית|שנתית/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, 120);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
