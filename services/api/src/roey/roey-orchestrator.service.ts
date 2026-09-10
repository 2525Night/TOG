import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { GoogleAiStudioProvider } from "./google-ai-studio.provider";
import { RoeyContextService } from "./roey-context.service";
import {
  RoeyFactRegistryService,
  type RoeyFactPack,
} from "./roey-fact-registry.service";
import {
  ROEY_POLICY_VERSION,
  ROEY_PROMPT_VERSION,
  ROEY_RUNTIME_VERSION,
  ROEY_TURN_BUDGET,
  type RoeyIntent,
  type RoeyRunState,
} from "./roey-runtime.types";
import type { RoeyAgentOutput, RoeyFact } from "./roey.types";
import { RoeyToolRegistryService } from "./roey-tool-registry.service";
import type { RoeyActionPreview } from "./roey-action.types";
import { RoeyMemoryService } from "./roey-memory.service";
import { RoeyReconciliationService } from "./roey-reconciliation.service";
import { RoeyEscalationService } from "./roey-escalation.service";

type HistoryMessage = {
  role: "user" | "model";
  content: string;
};

type ExecuteTurnInput = {
  userId: string;
  conversationId: string | null;
  message: string;
  month?: string;
  apiKey: string;
  modelId: string;
  history: HistoryMessage[];
};

@Injectable()
export class RoeyOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RoeyContextService,
    private readonly facts: RoeyFactRegistryService,
    private readonly google: GoogleAiStudioProvider,
    private readonly tools: RoeyToolRegistryService,
    private readonly memory: RoeyMemoryService,
    private readonly reconciliation: RoeyReconciliationService,
    private readonly escalation: RoeyEscalationService,
  ) {}

  async execute(input: ExecuteTurnInput) {
    const intent = classifyRoeyIntent(input.message);
    const run = await this.prisma.roeyAgentRun.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        runtimeVersion: ROEY_RUNTIME_VERSION,
        promptVersion: ROEY_PROMPT_VERSION,
        policyVersion: ROEY_POLICY_VERSION,
        modelId: input.modelId,
        intent,
        state: "ANALYZE",
        maxModelCalls: ROEY_TURN_BUDGET.maxModelCalls,
        maxToolCalls: ROEY_TURN_BUDGET.maxToolCalls,
      },
    });

    try {
      await this.state(run.id, "RETRIEVE");
      const built = await this.span(
        run.id,
        "TOOL",
        "GET_CONTEXT",
        { month: input.month || null },
        () => this.context.build(input.userId, input.month),
      );
      const factPack = await this.span(
        run.id,
        "TOOL",
        "GET_FACT_PACK",
        { intent, messageHash: hash(input.message) },
        () =>
          this.facts.build(
            input.userId,
            built,
            intent,
            input.message,
          ),
      );
      const remembered = await this.memory.rememberExplicitStatement(
        input.userId,
        input.conversationId,
        input.message,
      );
      const memory = await this.span(
        run.id,
        "TOOL",
        "GET_MEMORY",
        { conversationId: input.conversationId },
        () => this.memory.context(input.userId, input.conversationId),
      );
      await this.prisma.roeyAgentRun.update({
        where: { id: run.id },
        data: {
          state: "PLAN",
          contextHash: factPack.contextHash,
          toolCalls: remembered ? 4 : 3,
        },
      });

      if (
        intent === "VULNERABILITY" ||
        intent === "REGULATED" ||
        intent === "DISPUTE"
      ) {
        await this.state(run.id, "ESCALATE");
        const result = await this.span(
          run.id,
          "POLICY",
          "CREATE_ESCALATION",
          { intent },
          () =>
            this.escalation.createForTurn({
              userId: input.userId,
              conversationId: input.conversationId,
              runId: run.id,
              intent,
              message: input.message,
              factIds: factPack.facts.map((fact) => fact.id),
            }),
        );
        const output: RoeyAgentOutput = {
          messageHe: result.responseHe,
          recommendationHe: null,
          alternativesHe: [],
          questionHe: null,
          confidence: "HIGH",
        };
        const citations = inferCitations(output, factPack);
        await this.complete(run.id, citations, "ESCALATE");
        return {
          runId: run.id,
          intent,
          built,
          factPack,
          output,
          citations,
          escalation: result.escalation,
        };
      }

      if (intent === "ACTION") {
        await this.state(run.id, "PROPOSE");
        const toolResult = await this.span(
          run.id,
          "TOOL",
          "PROPOSE_ACTION",
          { messageHash: hash(input.message) },
          () =>
            this.tools.handleAction(
              input.userId,
              input.conversationId,
              input.message,
            ),
        );
        await this.prisma.roeyAgentRun.update({
          where: { id: run.id },
          data: { toolCalls: remembered ? 5 : 4 },
        });
        const actionPreview = toolResult.proposal
          ?.preview as unknown as RoeyActionPreview | undefined;
        const output: RoeyAgentOutput = toolResult.proposal && actionPreview
          ? {
              messageHe:
                "הכנתי את הפעולה כטיוטה. בדוק את ההשפעה והפרטים לפני אישור.",
              recommendationHe:
                actionPreview.severity === "CRITICAL"
                  ? "ההשפעה עלולה להחמיר את המצב הפיננסי. מומלץ לבחור חלופה בטוחה יותר."
                  : null,
              alternativesHe: actionPreview.alternativeHe
                ? [actionPreview.alternativeHe]
                : [],
              questionHe: null,
              confidence: "HIGH",
            }
          : {
              messageHe:
                toolResult.clarificationHe ||
                "נדרש מידע נוסף כדי להכין את הפעולה.",
              recommendationHe: null,
              alternativesHe: [],
              questionHe: null,
              confidence: "HIGH",
            };
        const citations = inferCitations(output, factPack);
        if (toolResult.proposal) {
          await this.prisma.roeyActionProposal.update({
            where: { id: toolResult.proposal.id },
            data: { runId: run.id },
          });
          await this.complete(run.id, citations, "AWAIT_APPROVAL");
        } else {
          await this.complete(run.id, citations, "CLARIFY");
        }
        return {
          runId: run.id,
          intent,
          built,
          factPack,
          output,
          citations,
          actionProposal: toolResult.proposal,
        };
      }

      const blockedCapability = detectFalseCapabilityClaim(input.message);
      if (blockedCapability) {
        const output: RoeyAgentOutput = {
          messageHe: blockedCapability,
          recommendationHe: null,
          alternativesHe: [],
          questionHe: null,
          confidence: "HIGH",
        };
        const citations = inferCitations(output, factPack);
        await this.complete(run.id, citations);
        return { runId: run.id, intent, built, factPack, output, citations };
      }

      await this.state(run.id, "RESPOND");
      const modelOutput = await this.span(
        run.id,
        "MODEL",
        input.modelId,
        {
          contextHash: factPack.contextHash,
          historyCount: input.history.length,
        },
        () =>
          this.google.generate(
            input.apiKey,
            input.modelId,
            {
              factPack,
              memory,
              risk: built.risk,
              forecast: built.forecast,
              responsePolicy: {
                naturalConversation: true,
                citeOnlySuppliedFacts: true,
                unavailableCapabilitiesAreHardBoundaries: true,
              },
            },
            input.history,
            input.message,
          ),
      );
      await this.prisma.roeyAgentRun.update({
        where: { id: run.id },
        data: { modelCalls: 1 },
      });
      const output = resolveGroundedOutput(
        modelOutput,
        factPack,
        built.journey.messageHe,
      );
      const citations = inferCitations(output, factPack);
      await this.complete(run.id, citations);
      await this.reconciliation
        .scheduleForecast(input.userId, run.id, built.forecast)
        .catch((error) => {
          console.error("Roey forecast reconciliation scheduling failed", {
            runId: run.id,
            error,
          });
        });
      return { runId: run.id, intent, built, factPack, output, citations };
    } catch (error) {
      await this.prisma.roeyAgentRun.update({
        where: { id: run.id },
        data: {
          state: "FAILED",
          completedAt: new Date(),
          errorCode: safeErrorCode(error),
        },
      });
      throw error;
    }
  }

  recentRuns(userId: string) {
    return this.prisma.roeyAgentRun.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        conversationId: true,
        runtimeVersion: true,
        promptVersion: true,
        policyVersion: true,
        modelId: true,
        intent: true,
        state: true,
        modelCalls: true,
        toolCalls: true,
        citedFactIdsJson: true,
        startedAt: true,
        completedAt: true,
        errorCode: true,
        spans: {
          orderBy: { startedAt: "asc" },
          select: {
            type: true,
            name: true,
            status: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
    });
  }

  private async complete(
    runId: string,
    citations: Array<{ factId: string; claimHe: string; source: string }>,
    state:
      | "COMPLETE"
      | "AWAIT_APPROVAL"
      | "CLARIFY"
      | "ESCALATE" = "COMPLETE",
  ) {
    await this.prisma.$transaction([
      ...(citations.length
        ? [
            this.prisma.roeyClaimEvidence.createMany({
              data: citations.map((citation) => ({
                runId,
                factId: citation.factId,
                claimHe: citation.claimHe,
                source: citation.source,
              })),
            }),
          ]
        : []),
      this.prisma.roeyAgentRun.update({
        where: { id: runId },
        data: {
          state,
          completedAt:
            state === "AWAIT_APPROVAL" ? null : new Date(),
          citedFactIdsJson: JSON.stringify(
            citations.map((citation) => citation.factId),
          ),
        },
      }),
    ]);
  }

  private state(runId: string, state: RoeyRunState) {
    return this.prisma.roeyAgentRun.update({
      where: { id: runId },
      data: { state },
    });
  }

  private async span<T>(
    runId: string,
    type: string,
    name: string,
    input: unknown,
    execute: () => Promise<T>,
  ): Promise<T> {
    const span = await this.prisma.roeyAgentTraceSpan.create({
      data: {
        runId,
        type,
        name,
        status: "RUNNING",
        inputHash: hash(input),
      },
    });
    try {
      const output = await execute();
      await this.prisma.roeyAgentTraceSpan.update({
        where: { id: span.id },
        data: {
          status: "SUCCEEDED",
          outputHash: hash(output),
          completedAt: new Date(),
        },
      });
      return output;
    } catch (error) {
      await this.prisma.roeyAgentTraceSpan.update({
        where: { id: span.id },
        data: {
          status: "FAILED",
          metadataJson: JSON.stringify({ errorCode: safeErrorCode(error) }),
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }
}

export function classifyRoeyIntent(message: string): RoeyIntent {
  if (
    /הונאה|גנב|פרצו|כפייה|מאיים|אלימות|אין.*אוכל|חדלות|פשיטת רגל|התאבד/i.test(
      message,
    )
  ) {
    return "VULNERABILITY";
  }
  // Tax/invest/legal only — never bare "מס" (false-positive on מסעדות).
  if (
    /מניה|השקע(?:ה|ות)|לקנות.*נייר|מס(?:ים| הכנסה| ערך מוסף|\s*מע["״]?מ)|עורך דין|ייעוץ משפטי|ביטוח.*כדאי/i.test(
      message,
    )
  ) {
    return "REGULATED";
  }
  if (/לא נכון|טעות|חולק|ערעור|תתקן.*יתרה|למה.*לא תואם/i.test(message)) {
    return "DISPUTE";
  }
  if (/תוסיף|תעדכן|תשנה|תיצור|תקצה|תרשום|בצע|תבצע/i.test(message)) {
    return "ACTION";
  }
  if (
    /לבנות תוכנית|תוכנית ל|תכנית ל|מטרה שלי|מסלול ל|תכנון פיננסי|לבנות מסלול/i.test(
      message,
    )
  ) {
    return "PLAN";
  }
  if (
    /מה יקרה|מה אם|תרחיש|אם.*אז|אפשרויות|להשוות|אבטל|אוותר על/i.test(message)
  ) {
    return "EXPLORE";
  }
  return "EXPLAIN";
}

function inferCitations(output: RoeyAgentOutput, pack: RoeyFactPack) {
  const text = [
    output.messageHe,
    output.recommendationHe,
    ...output.alternativesHe,
    output.questionHe,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const direct = pack.facts.filter((fact) => referencesFact(text, fact));
  const selected = direct.length > 0 ? direct : pack.facts.slice(0, 3);
  return selected.map((fact) => ({
    factId: fact.id,
    claimHe: output.messageHe.slice(0, 500),
    source: fact.source,
  }));
}

function referencesFact(text: string, fact: RoeyFact) {
  if (typeof fact.value === "string") {
    return fact.value.length >= 4 && text.includes(fact.value);
  }
  const rounded = Math.round(fact.value);
  return (
    text.includes(String(rounded)) ||
    text.includes(rounded.toLocaleString("he-IL")) ||
    text.includes(fact.displayHe)
  );
}

function contradictsCapabilities(
  output: RoeyAgentOutput,
  pack: RoeyFactPack,
) {
  const bankUnavailable = pack.capabilities.some(
    (capability) =>
      capability.id === "moneytail.bank-sync" &&
      capability.mode === "UNAVAILABLE",
  );
  if (!bankUnavailable) return false;
  return /(?:מסונכרן|מתעדכן|קיבלנו|מקבלת|משכנו).{0,30}(?:מהבנק|מהבנקים)|(?:חבר|תחבר|לחיבור|סנכרן|תרענן).{0,24}(?:בנק|חשבון הבנק)/i.test(
    output.messageHe,
  );
}

function detectFalseCapabilityClaim(message: string) {
  if (/תרענן|תסנכרן|תמשוך.{0,20}(?:מהבנק|חשבון בנק)/i.test(message)) {
    return "אין כרגע חיבור אוטומטי לבנק, ולכן איני יכול לרענן או למשוך יתרה. הנתונים ב-MoneyTail מבוססים על הזנה ידנית ומסמכים.";
  }
  return null;
}

function resolveGroundedOutput(
  modelOutput: RoeyAgentOutput | null,
  pack: RoeyFactPack,
  journeyMessage: string,
): RoeyAgentOutput {
  if (!modelOutput) {
    return softCapabilityFallback(journeyMessage);
  }
  if (contradictsCapabilities(modelOutput, pack)) {
    return {
      messageHe:
        "אין כרגע חיבור אוטומטי לבנק ב-MoneyTail. הצעד המעשי הוא להוסיף תנועה אחת ידנית מתמונת המצב או ממסך התנועות.",
      recommendationHe: "לרשום הוצאה או הכנסה אמיתית אחת מהימים האחרונים.",
      alternativesHe: ["לפתוח תנועות", "לבדוק את הזמין בפועל"],
      questionHe: "איזו תנועה הכי קל לך להוסיף עכשיו?",
      confidence: "HIGH",
    };
  }
  if (moneyClaimsAreGrounded(modelOutput, pack)) {
    return modelOutput;
  }
  const sanitized = sanitizeUngroundedMoney(modelOutput, pack);
  if (sanitized.messageHe.trim().length >= 24) {
    return { ...sanitized, confidence: "LOW" };
  }
  return softCapabilityFallback(journeyMessage);
}

function softCapabilityFallback(journeyMessage: string): RoeyAgentOutput {
  return {
    messageHe: `אענה בזהירות כי חלק מהמספרים לא אומתו מול הנתונים ב-MoneyTail. ${journeyMessage}`,
    recommendationHe: "להוסיף או לעדכן תנועה אחת אמיתית כדי לחדד את התמונה.",
    alternativesHe: ["לבדוק את תמונת המצב", "לפתוח את כרטיס הפעולות"],
    questionHe: "מה תרצה לבדוק קודם — יתרה, הוצאות או הצעד הבא?",
    confidence: "LOW",
  };
}

/** Only money-like amounts must match facts; small conversational numbers are free. */
function moneyClaimsAreGrounded(
  output: RoeyAgentOutput,
  pack: RoeyFactPack,
) {
  const claimed = extractMoneyLikeNumbers(
    [
      output.messageHe,
      output.recommendationHe,
      ...output.alternativesHe,
      output.questionHe,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" "),
  );
  if (claimed.length === 0) return true;
  const allowed = allowedMoneySet(pack);
  return claimed.every((value) => isAllowedMoney(value, allowed));
}

function sanitizeUngroundedMoney(
  output: RoeyAgentOutput,
  pack: RoeyFactPack,
): RoeyAgentOutput {
  const allowed = allowedMoneySet(pack);
  const clean = (text: string | null) => {
    if (!text) return text;
    return text
      .split(/(?<=[.!?…]|\n)/)
      .filter((sentence) => {
        const money = extractMoneyLikeNumbers(sentence);
        return money.every((value) => isAllowedMoney(value, allowed));
      })
      .join("")
      .trim();
  };
  return {
    ...output,
    messageHe: clean(output.messageHe) || output.messageHe.slice(0, 180),
    recommendationHe: clean(output.recommendationHe),
    alternativesHe: output.alternativesHe
      .map((item) => clean(item))
      .filter((item): item is string => Boolean(item && item.length > 0)),
    questionHe: clean(output.questionHe),
  };
}

function allowedMoneySet(pack: RoeyFactPack) {
  const allowed = new Set<number>([0, 1, 2, 3, 30, 60, 90, 100, 365]);
  for (const fact of pack.facts) {
    if (typeof fact.value === "number") allowed.add(fact.value);
    for (const value of extractNumbers(fact.displayHe)) allowed.add(value);
  }
  return allowed;
}

function isAllowedMoney(value: number, allowed: Set<number>) {
  return [...allowed].some(
    (source) =>
      Math.abs(value - source) <= Math.max(0.05, Math.abs(source) * 0.01) ||
      value === Math.round(source),
  );
}

function extractMoneyLikeNumbers(value: string) {
  const moneyTagged = [
    ...value.matchAll(
      /(?:₪|ש["״]?ח\.?|NIS)\s*(-?\d[\d,]*(?:\.\d+)?)|(-?\d[\d,]*(?:\.\d+)?)\s*(?:₪|ש["״]?ח\.?)/gi,
    ),
  ]
    .map((match) => Number((match[1] || match[2] || "").replace(/,/g, "")))
    .filter(Number.isFinite);
  if (moneyTagged.length > 0) return moneyTagged;
  // Untagged amounts that look like money (not days/counts).
  return extractNumbers(value).filter((n) => Math.abs(n) >= 50);
}

function extractNumbers(value: string) {
  return (value.match(/-?\d[\d,]*(?:\.\d+)?/g) || [])
    .map((item) => Number(item.replace(/,/g, "")))
    .filter(Number.isFinite);
}

function hash(value: unknown) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

function safeErrorCode(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    return `HTTP_${String(error.status)}`;
  }
  return "AGENT_RUN_FAILED";
}
