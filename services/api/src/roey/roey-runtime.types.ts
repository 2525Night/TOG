export const ROEY_RUNTIME_VERSION = "roey-runtime-v2";
export const ROEY_PROMPT_VERSION = "roey-natural-v3";
export const ROEY_POLICY_VERSION = "roey-policy-v2";

export type RoeyRunState =
  | "ANALYZE"
  | "RETRIEVE"
  | "PLAN"
  | "CLARIFY"
  | "RESPOND"
  | "PROPOSE"
  | "AWAIT_APPROVAL"
  | "VERIFY"
  | "COMPLETE"
  | "ESCALATE"
  | "FAILED";

export type RoeyIntent =
  | "EXPLAIN"
  | "EXPLORE"
  | "PLAN"
  | "ACTION"
  | "DISPUTE"
  | "REGULATED"
  | "VULNERABILITY";

export type RoeyToolName =
  | "GET_FACT_PACK"
  | "GET_FINANCIAL_PLAN"
  | "DRAFT_PLAN_CHANGE"
  | "PROPOSE_ACTION"
  | "ASK_CLARIFICATION"
  | "CREATE_ESCALATION";

export type RoeyCapability = {
  id: string;
  descriptionHe: string;
  mode: "READ" | "DRAFT" | "APPROVAL_REQUIRED" | "UNAVAILABLE";
  reasonHe?: string;
};

export type RoeyCitation = {
  factId: string;
  claimHe: string;
};

export type RoeyTurnBudget = {
  maxModelCalls: 3;
  maxToolCalls: 5;
  maxDurationMs: 30_000;
};

export const ROEY_TURN_BUDGET: RoeyTurnBudget = {
  maxModelCalls: 3,
  maxToolCalls: 5,
  maxDurationMs: 30_000,
};
