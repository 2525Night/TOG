/** Keep in sync with packages/shared CATEGORY_NATURE. */

export type CategoryNature = "fixed" | "variable" | "periodic";

const CATEGORY_NATURE: Record<string, CategoryNature> = {
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

const CATEGORY_HE: Record<string, string> = {
  housing: "דיור",
  food: "מזון",
  transport: "תחבורה",
  utilities: "חשבונות בית",
  cellular: "סלולר",
  internet: "אינטרנט",
  subscriptions: "מנויים",
  healthcare: "בריאות",
  insurance: "ביטוח",
  shopping: "קניות",
  entertainment: "בילויים",
  education: "חינוך",
  children: "ילדים",
  loans: "הלוואות",
  banking: "עמלות בנק",
  travel: "נסיעות",
  goal_funding: "ליעדים",
  other: "אחר",
  salary: "משכורת",
  freelance: "פרילנס",
  benefits: "קצבאות / הטבות",
  other_income: "הכנסה אחרת",
};

export type CategoryExtras = {
  natures?: Record<string, CategoryNature>;
  labels?: Record<string, string>;
};

export function categoryNature(
  categoryKey: string,
  extras?: CategoryExtras,
): CategoryNature {
  const fromUser = extras?.natures?.[categoryKey];
  if (fromUser) return fromUser;
  return CATEGORY_NATURE[categoryKey] || "variable";
}

export function categoryLabelHe(
  key: string,
  extras?: CategoryExtras,
): string {
  if (extras?.labels?.[key]) return extras.labels[key];
  if (CATEGORY_HE[key]) return CATEGORY_HE[key];
  if (key.startsWith("custom:")) {
    return key.slice("custom:".length).replace(/-/g, " ") || key;
  }
  return key;
}

export function natureLabelHe(nature: CategoryNature): string {
  if (nature === "fixed") return "קבוע";
  if (nature === "periodic") return "מחזורי";
  return "משתנה";
}
