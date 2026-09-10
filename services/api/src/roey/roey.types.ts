export type RoeyJourneyStage =
  | "INTRODUCTION"
  | "BASELINE"
  | "ESTABLISHED"
  | "RETURNING";

export type RoeySeverity = "INFO" | "WARNING" | "CRITICAL";
export type RoeyConfidence = "LOW" | "MEDIUM" | "HIGH";

export type RoeyJourney = {
  stage: RoeyJourneyStage;
  titleHe: string;
  messageHe: string;
  completedMonths: number;
  reliableMonths: number;
  daysSinceRegistration: number;
  daysSinceLastActivity: number | null;
  signalsReliable: boolean;
};

export type RoeyForecastPoint = {
  days: 30 | 60 | 90;
  projectedAvailable: number;
};

export type RoeyForecastScenario = {
  id: "POSITIVE" | "BASE" | "STRESS";
  labelHe: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  points: RoeyForecastPoint[];
};

export type RoeyForecast = {
  currency: "ILS";
  computedAt: string;
  startingAvailable: number;
  confidence: RoeyConfidence;
  assumptionsHe: string[];
  marketContext: {
    policyRatePct: number | null;
    annualCpiPct: number | null;
    observedAt: string | null;
    sourceNames: string[];
  };
  scenarios: RoeyForecastScenario[];
};

export type RoeyRisk = {
  severity: RoeySeverity;
  titleHe: string;
  messageHe: string;
  amountIls: number | null;
  horizonDays: number | null;
};

export type RoeyFact = {
  id: string;
  labelHe: string;
  value: number | string;
  displayHe: string;
  source: string;
  observedAt?: string;
  retrievedAt?: string;
  reliability?: "VERIFIED" | "ESTIMATED" | "PARTIAL";
  freshness?: "CURRENT" | "STALE" | "UNKNOWN";
  formulaVersion?: string;
};

export type RoeyAgentOutput = {
  messageHe: string;
  recommendationHe: string | null;
  alternativesHe: string[];
  questionHe: string | null;
  confidence: RoeyConfidence;
};

export type RoeyChatResponse = {
  conversationId: string | null;
  message: RoeyAgentOutput;
  severity: RoeySeverity;
  risk: RoeyRisk;
  journey: RoeyJourney;
  factsUsed: RoeyFact[];
  forecast: RoeyForecast;
  modelId: string;
  agent: {
    runId: string;
    intent: string;
    citations: Array<{
      factId: string;
      claimHe: string;
      source: string;
    }>;
    capabilities: Array<{
      id: string;
      descriptionHe: string;
      mode: string;
      reasonHe?: string;
    }>;
  };
  actionProposal?: {
    id: string;
    type: string;
    status: string;
    severity: string;
    requiresDoubleConfirm: boolean;
    expiresAt: string | Date;
    preview: Record<string, unknown>;
  } | null;
  escalation?: {
    id: string;
    type: string;
    urgency: string;
    status: string;
    summaryHe: string;
  } | null;
};

export const ROEY_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["messageHe", "confidence"],
  properties: {
    messageHe: {
      type: "string",
      description:
        "תשובה טבעית בעברית, באורך ובמבנה שמתאימים לשיחה הנוכחית.",
    },
    recommendationHe: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    alternativesHe: {
      type: "array",
      maxItems: 3,
      items: { type: "string" },
    },
    questionHe: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    confidence: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH"],
    },
  },
} as const;
