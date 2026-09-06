export type TxDirection = "INCOME" | "EXPENSE" | "TRANSFER";

export type CategoryResult = {
  categoryKey: string;
  categoryLabelHe: string;
  merchantNorm: string;
  confidence: number;
  evidence: string[];
  recurringHint?: boolean;
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
  other: "אחר",
  salary: "משכורת",
  freelance: "פרילנס",
  benefits: "קצבאות / הטבות",
  other_income: "הכנסה אחרת",
};

const EXPENSE_RULES: Array<{ key: string; re: RegExp }> = [
  { key: "housing", re: /שכירות|משכנת|טפחות|ארנונה|ועד בית|הוראת קבע/i },
  { key: "food", re: /סופר|רמי|שופרסל|victory|ויקטורי|יינות ביתן|טיב טעם/i },
  {
    key: "transport",
    re: /פז|דלק|דלקן|תדלוק|waze|דן\b|אגד|משיכת מזומן/i,
  },
  { key: "cellular", re: /סלולר|פרטנר|סלקום|הוט מובייל|pelephone/i },
  { key: "internet", re: /בזק|ספק אינטרנט|חברת אינטרנט|הוט(?!\s*מובייל)|yes\b/i },
  {
    key: "subscriptions",
    re: /נטפליקס|spotify|ענן|adobe|subscription/i,
  },
  {
    key: "banking",
    re: /עמל|כרטיס דביט|כרטיסי אשראי|מקס |ישראכרט|כאל|החזרת הרשאה|עמלת החזר|ויזה|לאומי ויזה|הרשאה ישראכרט/i,
  },
  {
    key: "loans",
    re: /הלווא|פרעון|מימון|סילוק פיגור|העברה לפיגור|לובינסקי/i,
  },
  {
    key: "insurance",
    re: /ביטוח|הראל|כלל|מגדל|הפניקס|ביטוח לאומי/i,
  },
  {
    key: "healthcare",
    re: /קופ.?ח|מכבי|כללית|לאומית|בית מרקחת|סופר־פארם|super.?pharm/i,
  },
  { key: "shopping", re: /אייץ אנד או|h&m|זארה|castro|גולף|עזריאלי/i },
  { key: "children", re: /גן ילדים|צהרון|חינוך|בית ספר|ישיבת/i },
];

const INCOME_RULES: Array<{ key: string; re: RegExp }> = [
  { key: "salary", re: /משכורת|שכר\b|salary/i },
  { key: "benefits", re: /קצבת|קצבאות/i },
  { key: "freelance", re: /פרילנס|חשבונית|עצמאי/i },
  {
    key: "other_income",
    re: /העברה דיגיטל|הפקד|תקבול|החזר מס|זכות|זיכוי|יומן זכות|הפקדת שיק/i,
  },
];

export function categoryLabelHe(key: string): string {
  return CATEGORY_HE[key] || key;
}

export function normalizeMerchant(description: string): string {
  return (description || "")
    .toLowerCase()
    .replace(/-י\b/g, "")
    .replace(/[^\u0590-\u05FFa-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function resolveCategory(
  description: string,
  direction: TxDirection,
  opts?: {
    rememberedCategoryKey?: string | null;
    recurringCount?: number;
  },
): CategoryResult {
  const merchantNorm = normalizeMerchant(description);
  const evidence: string[] = [];

  if (opts?.rememberedCategoryKey) {
    evidence.push(`mem:${opts.rememberedCategoryKey}`);
    return {
      categoryKey: opts.rememberedCategoryKey,
      categoryLabelHe: categoryLabelHe(opts.rememberedCategoryKey),
      merchantNorm,
      confidence: 0.92,
      evidence,
      recurringHint: (opts.recurringCount || 0) >= 2,
    };
  }

  if (direction === "TRANSFER") {
    return {
      categoryKey: "other",
      categoryLabelHe: categoryLabelHe("other"),
      merchantNorm,
      confidence: 0.7,
      evidence: ["transfer"],
    };
  }

  const rules = direction === "INCOME" ? INCOME_RULES : EXPENSE_RULES;
  for (const rule of rules) {
    if (rule.re.test(description)) {
      evidence.push(`rule:${rule.key}`);
      const recurringHint = (opts?.recurringCount || 0) >= 2;
      if (recurringHint) evidence.push("recurring");
      return {
        categoryKey: rule.key,
        categoryLabelHe: categoryLabelHe(rule.key),
        merchantNorm,
        confidence: recurringHint ? 0.88 : 0.8,
        evidence,
        recurringHint,
      };
    }
  }

  const fallback = direction === "INCOME" ? "other_income" : "other";
  evidence.push("fallback");
  return {
    categoryKey: fallback,
    categoryLabelHe: categoryLabelHe(fallback),
    merchantNorm,
    confidence: 0.25,
    evidence,
    recurringHint: (opts?.recurringCount || 0) >= 2,
  };
}
