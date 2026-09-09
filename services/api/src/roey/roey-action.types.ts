import type { RoeySeverity } from "./roey.types";

export type RoeyActionType =
  | "ADD_TRANSACTION"
  | "CREATE_COMMITMENT"
  | "CHANGE_TRANSACTION_CATEGORY"
  | "ALLOCATE_SURPLUS_TO_GOAL";

export type AddTransactionPayload = {
  direction: "INCOME" | "EXPENSE";
  amount: number;
  categoryKey: string;
  bookedAt: string;
  description?: string;
};

export type CreateCommitmentPayload = {
  titleHe: string;
  categoryKey: string;
  expectedAmount: number;
  cadence: "MONTHLY" | "YEARLY";
  anchorDay?: number;
};

export type ChangeTransactionCategoryPayload = {
  transactionId: string;
  categoryKey: string;
};

export type AllocateSurplusPayload = {
  goalId: string;
  amount: number;
  month: string;
};

export type RoeyActionPayload =
  | AddTransactionPayload
  | CreateCommitmentPayload
  | ChangeTransactionCategoryPayload
  | AllocateSurplusPayload;

export type RoeyActionPreview = {
  titleHe: string;
  summaryHe: string;
  effectHe: string;
  alternativeHe: string | null;
  amountIls: number | null;
  availableBefore: number | null;
  availableAfter: number | null;
  severity: RoeySeverity;
  requiresDoubleConfirm: boolean;
};
