import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { FinancialPlanService } from "./financial-plan.service";
import { RoeyContextService } from "./roey-context.service";
import type {
  RoeyCapability,
  RoeyIntent,
} from "./roey-runtime.types";
import type { RoeyFact } from "./roey.types";

type BuiltContext = Awaited<ReturnType<RoeyContextService["build"]>>;

export type RoeyFactPack = {
  packVersion: "roey-facts-v2";
  intent: RoeyIntent;
  topic: string;
  contextHash: string;
  facts: RoeyFact[];
  capabilities: RoeyCapability[];
  dataQuality: BuiltContext["context"]["dataQuality"];
  journey: BuiltContext["journey"];
  plan: unknown;
};

@Injectable()
export class RoeyFactRegistryService {
  constructor(private readonly financialPlan: FinancialPlanService) {}

  async build(
    userId: string,
    built: BuiltContext,
    intent: RoeyIntent,
    userMessage: string,
  ): Promise<RoeyFactPack> {
    const plan = await this.financialPlan.context(userId);
    const facts = this.collectFacts(built, plan);
    const topic = detectTopic(userMessage);
    const selected = selectFacts(facts, topic);
    const capabilities = this.capabilities(Boolean(built.context.market));
    const payload = {
      packVersion: "roey-facts-v2" as const,
      intent,
      topic,
      facts: selected,
      capabilities,
      dataQuality: built.context.dataQuality,
      journey: built.journey,
      plan,
    };
    return {
      ...payload,
      contextHash: createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex"),
    };
  }

  private collectFacts(built: BuiltContext, plan: unknown) {
    const facts: Array<RoeyFact & { topics: string[] }> =
      built.factsUsed.map((fact) => ({
        ...fact,
        topics:
          fact.id === "debt-principal"
            ? ["debt", "liquidity"]
            : ["liquidity", "cashflow"],
      }));
    const base = built.forecast.scenarios.find(
      (scenario) => scenario.id === "BASE",
    );
    for (const point of base?.points || []) {
      facts.push({
        id: `forecast.base.day-${point.days}`,
        labelHe: `זמין צפוי בעוד ${point.days} יום`,
        value: point.projectedAvailable,
        displayHe: formatIls(point.projectedAvailable),
        source: "RoeyForecastService.BASE",
        observedAt: built.forecast.computedAt,
        retrievedAt: new Date().toISOString(),
        reliability:
          built.forecast.confidence === "HIGH"
            ? "VERIFIED"
            : "ESTIMATED",
        freshness: "CURRENT",
        formulaVersion: "roey-forecast-v2",
        topics: ["forecast", "cashflow", "liquidity"],
      });
    }
    const market = built.context.market;
    if (market?.policyRate) {
      facts.push({
        id: "market.boi.policy-rate",
        labelHe: "ריבית בנק ישראל",
        value: market.policyRate.percent,
        displayHe: `${market.policyRate.percent}%`,
        source: market.policyRate.sourceUrl,
        observedAt: market.policyRate.observedAt,
        retrievedAt: market.fetchedAt,
        reliability: "VERIFIED",
        freshness: market.stale ? "STALE" : "CURRENT",
        formulaVersion: "official-source",
        topics: ["market", "debt", "forecast"],
      });
    }
    if (market?.cpi) {
      facts.push({
        id: "market.cbs.cpi-annual",
        labelHe: "שינוי שנתי במדד המחירים",
        value: market.cpi.annualChangePct,
        displayHe: `${market.cpi.annualChangePct}%`,
        source: market.cpi.sourceUrl,
        observedAt: market.cpi.observedAt,
        retrievedAt: market.fetchedAt,
        reliability: "VERIFIED",
        freshness: market.stale ? "STALE" : "CURRENT",
        formulaVersion: "official-source",
        topics: ["market", "forecast", "cashflow"],
      });
    }
    if (
      plan &&
      typeof plan === "object" &&
      "objectiveHe" in plan &&
      typeof plan.objectiveHe === "string"
    ) {
      facts.push({
        id: "plan.current.objective",
        labelHe: "היעד הנוכחי",
        value: plan.objectiveHe,
        displayHe: plan.objectiveHe,
        source: "UserFinancialPlan.objectiveHe",
        retrievedAt: new Date().toISOString(),
        reliability: "VERIFIED",
        freshness: "CURRENT",
        formulaVersion: "user-confirmed",
        topics: ["plan", "goal"],
      });
    }
    return facts;
  }

  private capabilities(hasMarketData: boolean): RoeyCapability[] {
    return [
      {
        id: "moneytail.read-financial-facts",
        descriptionHe: "קריאת עובדות מחושבות ומתועדות ב-MoneyTail",
        mode: "READ",
      },
      {
        id: "moneytail.bank-sync",
        descriptionHe: "סנכרון אוטומטי מול חשבון בנק",
        mode: "UNAVAILABLE",
        reasonHe:
          "אין חיבור Open Banking פעיל. הנתונים מבוססים על הזנה ידנית ומסמכים.",
      },
      {
        id: "moneytail.update-observed-balance",
        descriptionHe: "עדכון יתרת עו״ש שנצפתה",
        mode: "UNAVAILABLE",
        reasonHe:
          "טרם קיים כלי התאמת יתרה. אין להבטיח רענון או סנכרון בנקאי.",
      },
      {
        id: "moneytail.propose-actions",
        descriptionHe:
          "הכנת תנועה, התחייבות, שינוי קטגוריה או הקצאה ליעד",
        mode: "APPROVAL_REQUIRED",
      },
      {
        id: "moneytail.market-data",
        descriptionHe: "קריאת נתוני שוק רשמיים",
        mode: hasMarketData ? "READ" : "UNAVAILABLE",
        ...(hasMarketData
          ? {}
          : { reasonHe: "מקורות השוק אינם זמינים כרגע." }),
      },
      {
        id: "moneytail.external-transfer",
        descriptionHe: "העברת כסף או שינוי בחשבון בנק חיצוני",
        mode: "UNAVAILABLE",
        reasonHe: "Roey אינו מחובר לבנק ואינו מבצע העברות חיצוניות.",
      },
    ];
  }
}

function detectTopic(message: string) {
  if (/ריבית|מדד|דולר|יורו|שוק/i.test(message)) return "market";
  if (/חוב|הלווא|אשראי|מסגרת/i.test(message)) return "debt";
  if (/יעד|מטרה|תוכנית|תכנית/i.test(message)) return "plan";
  if (/תחזית|בעתיד|יום|חודש הבא/i.test(message)) return "forecast";
  if (/יתרה|מינוס|זמין|עו.?ש|הכנס|הוצא|תזרים/i.test(message)) {
    return "liquidity";
  }
  return "overview";
}

function selectFacts(
  facts: Array<RoeyFact & { topics: string[] }>,
  topic: string,
) {
  const topicFacts = facts.filter(
    (fact) => fact.topics.includes(topic) || topic === "overview",
  );
  const selected = topicFacts.length > 0 ? topicFacts : facts;
  return selected.slice(0, 16).map(({ topics: _topics, ...fact }) => fact);
}

function formatIls(value: number) {
  return `₪${Math.round(value).toLocaleString("he-IL")}`;
}
