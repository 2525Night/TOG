/** Canonical MoneyTail shared types (Israel / ILS). */

export type SourceType =
  | "USER_INPUT"
  | "CHAT"
  | "FILE_UPLOAD"
  | "DOCUMENT_EXTRACTION"
  | "CALCULATION"
  | "AI_INFERENCE"
  | "MARKET_DATA"
  | "BANK_API"
  | "CREDIT_CARD_API"
  | "INSURANCE_API";

export type AccountKind =
  | "CASH"
  | "BANK"
  | "CREDIT_CARD"
  | "LOAN"
  | "INVESTMENT"
  | "OTHER";

export type TransactionDirection = "INCOME" | "EXPENSE" | "TRANSFER";

export type UserRole = "USER" | "ADMIN";

/** Expense budget nature for category defaults. */
export type CategoryNature = "fixed" | "variable" | "periodic";

export const DEFAULT_CURRENCY = "ILS" as const;
export const DEFAULT_JURISDICTION = "IL" as const;

/** Hebrew-first category keys used in MVP. */
export const EXPENSE_CATEGORIES = [
  { key: "housing", labelHe: "דיור" },
  { key: "food", labelHe: "מזון" },
  { key: "transport", labelHe: "תחבורה" },
  { key: "utilities", labelHe: "חשבונות בית" },
  { key: "cellular", labelHe: "סלולר" },
  { key: "internet", labelHe: "אינטרנט" },
  { key: "subscriptions", labelHe: "מנויים" },
  { key: "healthcare", labelHe: "בריאות" },
  { key: "insurance", labelHe: "ביטוח" },
  { key: "shopping", labelHe: "קניות" },
  { key: "entertainment", labelHe: "בילויים" },
  { key: "education", labelHe: "חינוך" },
  { key: "children", labelHe: "ילדים" },
  { key: "loans", labelHe: "הלוואות" },
  { key: "banking", labelHe: "עמלות בנק" },
  { key: "travel", labelHe: "נסיעות" },
  { key: "goal_funding", labelHe: "ליעדים" },
  { key: "other", labelHe: "אחר" },
] as const;

export const INCOME_CATEGORIES = [
  { key: "salary", labelHe: "משכורת" },
  { key: "freelance", labelHe: "פרילנס" },
  { key: "benefits", labelHe: "קצבאות / הטבות" },
  { key: "other_income", labelHe: "הכנסה אחרת" },
] as const;

/** Default nature per expense category key. */
export const CATEGORY_NATURE: Record<string, CategoryNature> = {
  housing: "fixed",
  utilities: "fixed",
  cellular: "fixed",
  internet: "fixed",
  insurance: "fixed",
  loans: "fixed",
  subscriptions: "fixed",
  banking: "fixed",
  food: "variable",
  transport: "variable",
  shopping: "variable",
  entertainment: "variable",
  travel: "variable",
  healthcare: "variable",
  education: "variable",
  children: "variable",
  goal_funding: "variable",
  other: "variable",
};

export function categoryNature(categoryKey: string): CategoryNature {
  return CATEGORY_NATURE[categoryKey] || "variable";
}

export function natureLabelHe(nature: CategoryNature): string {
  if (nature === "fixed") return "קבוע";
  if (nature === "periodic") return "מחזורי";
  return "משתנה";
}

export type CatOption = { key: string; labelHe: string; nature?: CategoryNature };

export function mergeCategoryOptions(
  builtIn: readonly { key: string; labelHe: string }[],
  userCats: Array<{ key: string; labelHe: string; nature?: string }>,
): CatOption[] {
  const seen = new Set(builtIn.map((c) => c.key));
  const out: CatOption[] = builtIn.map((c) => ({
    key: c.key,
    labelHe: c.labelHe,
    nature: CATEGORY_NATURE[c.key],
  }));
  for (const u of userCats) {
    if (seen.has(u.key)) continue;
    seen.add(u.key);
    out.push({
      key: u.key,
      labelHe: u.labelHe,
      nature:
        u.nature === "fixed" || u.nature === "periodic" ? u.nature : "variable",
    });
  }
  return out;
}

export interface ProvenanceMeta {
  sourceType: SourceType;
  sourceProvider?: string | null;
  sourceReference?: string | null;
  confidence?: number | null;
  userConfirmed: boolean;
}

const CATEGORY_MAP = new Map<string, string>([
  ...EXPENSE_CATEGORIES.map((c) => [c.key, c.labelHe] as [string, string]),
  ...INCOME_CATEGORIES.map((c) => [c.key, c.labelHe] as [string, string]),
]);

export function categoryLabelHe(
  key: string,
  extras?: Record<string, string>,
): string {
  if (extras?.[key]) return extras[key];
  if (CATEGORY_MAP.get(key)) return CATEGORY_MAP.get(key)!;
  if (key.startsWith("custom:")) {
    return key.slice("custom:".length).replace(/-/g, " ") || key;
  }
  return key;
}
