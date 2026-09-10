import type { RoeySeverity } from "./roey.types";

export function classifyActionImpact(
  availableBefore: number,
  availableAfter: number,
): {
  severity: RoeySeverity;
  requiresDoubleConfirm: boolean;
  alternativeHe: string | null;
} {
  const change = availableAfter - availableBefore;
  if (availableAfter < 0 && change < 0) {
    return {
      severity: "CRITICAL",
      requiresDoubleConfirm: true,
      alternativeHe:
        "להקטין את הסכום, לדחות את הפעולה או לצמצם התחייבות אחרת לפני האישור.",
    };
  }
  if (
    change < 0 &&
    (availableAfter < 500 ||
      Math.abs(change) >= Math.max(500, Math.abs(availableBefore) * 0.25))
  ) {
    return {
      severity: "WARNING",
      requiresDoubleConfirm: false,
      alternativeHe:
        "לשקול סכום קטן יותר כדי להשאיר מרווח ביטחון להוצאות בלתי צפויות.",
    };
  }
  return {
    severity: "INFO",
    requiresDoubleConfirm: false,
    alternativeHe: null,
  };
}
