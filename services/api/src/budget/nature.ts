/**
 * API helpers for category nature/labels.
 * Defaults come from @moneytail/shared (single source of truth).
 */
import {
  CATEGORY_NATURE,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  categoryNature as sharedCategoryNature,
  natureLabelHe as sharedNatureLabelHe,
  type CategoryNature,
} from "@moneytail/shared";

export type { CategoryNature };

const CATEGORY_HE: Record<string, string> = Object.fromEntries([
  ...EXPENSE_CATEGORIES.map((c) => [c.key, c.labelHe]),
  ...INCOME_CATEGORIES.map((c) => [c.key, c.labelHe]),
]);

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
  return sharedCategoryNature(categoryKey);
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
  return sharedNatureLabelHe(nature);
}

/** Re-export shared map for callers that need the raw defaults. */
export { CATEGORY_NATURE };
