import { classifyDirection } from "./direction-classifier";
import {
  categoryLabelHe,
  normalizeMerchant,
  resolveCategory,
} from "./category-resolver";
import { extractPdfText } from "./extract-pdf";

export type DraftRow = {
  direction: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
  categoryKey: string;
  categoryLabelHe: string;
  description: string;
  bookedAt: string;
  merchantNorm: string;
  confidence: number;
  evidence: string[];
  recurringHint?: boolean;
  duplicate?: boolean;
  /** Running balance after this row (statement) */
  balance?: number | null;
  /** Running balance before this row */
  prevBalance?: number | null;
  /** balance - prevBalance when both known */
  balanceDelta?: number | null;
  /** Flagged for user review (ambiguous direction) */
  needsReview?: boolean;
};

export type DetectedKind = "csv" | "pdf" | "image" | "xlsx";

export type ExtractMeta = {
  statementFrom?: string;
  statementTo?: string;
  defaultMonth?: string;
};

const SPREADSHEET_EXT = [".xlsx", ".xlsm", ".xls", ".xlsb", ".ods"];

export function detectKind(
  originalName: string,
  mimeType: string,
  bytes?: Buffer,
): DetectedKind | null {
  const lower = (originalName || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();
  const spreadsheetExt = SPREADSHEET_EXT.some((ext) => lower.endsWith(ext));
  const csvExt = lower.endsWith(".csv");

  if (spreadsheetExt) {
    if (bytes && sniffSpreadsheet(bytes)) return "xlsx";
    if (bytes && looksLikeCsvText(bytes)) return "csv";
    return "xlsx";
  }
  if (bytes && sniffSpreadsheet(bytes) && !csvExt) return "xlsx";
  if (
    mime.includes("spreadsheetml") ||
    mime.includes("excel.sheet") ||
    mime === "application/vnd.oasis.opendocument.spreadsheet"
  ) {
    return "xlsx";
  }

  if (csvExt || mime === "text/csv") return "csv";

  if (mime === "application/vnd.ms-excel" || mime === "application/excel") {
    if (bytes && sniffSpreadsheet(bytes)) return "xlsx";
    if (bytes && looksLikeCsvText(bytes)) return "csv";
    return "xlsx";
  }

  if (lower.endsWith(".pdf") || mime === "application/pdf") {
    return "pdf";
  }
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    mime.startsWith("image/")
  ) {
    return "image";
  }
  if (bytes && looksLikeCsvText(bytes) && !sniffSpreadsheet(bytes)) {
    return "csv";
  }
  return null;
}

/** ZIP Office files start with PK; OLE Compound (.xls) starts with D0 CF 11 E0. */
export function sniffSpreadsheet(bytes: Buffer): boolean {
  if (bytes.length < 8) return false;
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    const head = bytes.subarray(0, Math.min(bytes.length, 2048)).toString("latin1");
    return (
      head.includes("xl/") ||
      head.includes("[Content_Types].xml") ||
      head.includes("workbook.xml") ||
      head.includes("spreadsheetml")
    );
  }
  if (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    const head = bytes.subarray(0, Math.min(bytes.length, 8192)).toString("latin1");
    return /Workbook|Book|Excel|Worksheet|BIFF/i.test(head);
  }
  return false;
}

function looksLikeCsvText(bytes: Buffer, sampleSize = 4096): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, sampleSize));
  if (sample.includes(0)) return false;
  const text = sample.toString("utf8").replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  if (!first) return false;
  const commas = (first.match(/,/g) ?? []).length;
  const semis = (first.match(/;/g) ?? []).length;
  const tabs = (first.match(/\t/g) ?? []).length;
  return commas >= 2 || semis >= 2 || tabs >= 2;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  return extractPdfText(buffer);
}

/**
 * PDF text extractors often emit one table cell per line. Stitch until the
 * next date so bank-statement parsers see a single row.
 */
export function stitchStatementLines(text: string): string {
  const lines = text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const startsRow = (s: string) =>
    /^(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2})\b/.test(s);
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    out.push(buf.join(" "));
    buf = [];
  };
  for (const line of lines) {
    if (startsRow(line)) {
      flush();
      buf = [line];
      continue;
    }
    if (!buf.length) {
      out.push(line);
      continue;
    }
    buf.push(line);
  }
  flush();
  return out.join("\n");
}

export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  const Tesseract = await import("tesseract.js");
  const result = await Tesseract.recognize(buffer, "heb+eng", {
    logger: () => undefined,
  });
  return (result.data.text || "").trim();
}

/** Local calendar date → noon UTC-ish ISO without previous-day shift in IL. */
export function toLocalDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T12:00:00.000Z`;
}

export function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7);
}

export function detectStatementPeriod(text: string): ExtractMeta {
  const m = text.match(
    /לתקופה[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{2,4})\s*[-–—]\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i,
  );
  if (!m) return {};
  const from = parseDate(m[1]);
  const to = parseDate(m[2]);
  if (!from || !to) return {};
  return {
    statementFrom: toLocalDateIso(from).slice(0, 10),
    statementTo: toLocalDateIso(to).slice(0, 10),
    defaultMonth: monthKeyFromIso(toLocalDateIso(to)),
  };
}

function extractEmbeddedMoney(description: string): number[] {
  return [...description.matchAll(/([-+]?[\d,]+(?:\.\d{1,2})?)/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && Math.abs(n) >= 0.01);
}

function stripMoneyFromDescription(description: string): string {
  return description
    .replace(/₪\s*[-+]?[\d,]+(?:\.\d{1,2})?/g, "")
    .replace(/[-+]?[\d,]+(?:\.\d{1,2})?\s*₪/g, "")
    .replace(/[-+]?[\d,]+(?:\.\d{1,2})?/g, "")
    .replace(/\(\s*י\s*\)/g, "")
    .replace(/\)\s*י\s*\(/g, "")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * When PDF collapses columns, the real tx amount often remains inside the
 * description (e.g. "יומן זכות 5,000.00") while the numeric column is balance.
 */
export function resolveAmountAndDescription(input: {
  description: string;
  columnAmount: number;
  balance?: number | null;
  prevBalance?: number | null;
}): {
  amount: number;
  description: string;
  credit: number | null;
  debit: number | null;
} {
  const embedded = extractEmbeddedMoney(input.description);
  let amount = Math.abs(input.columnAmount);
  let signed: number | null = null;

  if (embedded.length) {
    const bal = input.balance;
    const prev = input.prevBalance;
    const notBalance = embedded.filter(
      (e) => bal == null || Math.abs(Math.abs(e) - Math.abs(bal)) > 0.051,
    );
    const pool = notBalance.length ? notBalance : embedded;
    const pick = pool[pool.length - 1];
    const absEmb = Math.abs(pick);

    const columnLooksLikeBalance =
      bal != null && Math.abs(amount - Math.abs(bal)) < 0.051;

    let delta: number | null = null;
    if (
      bal != null &&
      prev != null &&
      Number.isFinite(bal) &&
      Number.isFinite(prev)
    ) {
      delta = bal - prev;
    }

    const columnMatchesPool = pool.some(
      (e) => Math.abs(Math.abs(e) - amount) < 0.051,
    );

    if (columnMatchesPool) {
      // Column already holds the tx amount
      signed =
        pool.find((e) => Math.abs(Math.abs(e) - amount) < 0.051) ?? pick;
    } else if (delta != null && Math.abs(Math.abs(delta) - absEmb) < 0.051) {
      amount = absEmb;
      signed = pick;
    } else if (columnLooksLikeBalance && absEmb >= 0.01) {
      amount = absEmb;
      signed = pick;
    } else if (
      absEmb >= 0.01 &&
      amount > absEmb * 1.35 &&
      (delta == null || Math.abs(Math.abs(delta) - amount) > 0.051)
    ) {
      amount = absEmb;
      signed = pick;
    } else if (
      delta != null &&
      Math.abs(Math.abs(delta) - amount) > 0.051 &&
      Math.abs(delta) >= 0.01 &&
      Math.abs(Math.abs(delta) - absEmb) <=
        Math.abs(Math.abs(delta) - amount)
    ) {
      amount = absEmb;
      signed = pick;
    } else {
      signed =
        pool.find((e) => Math.abs(Math.abs(e) - amount) < 0.051) ?? null;
    }
  } else if (
    input.balance != null &&
    input.prevBalance != null &&
    Number.isFinite(input.balance) &&
    Number.isFinite(input.prevBalance)
  ) {
    const delta = input.balance - input.prevBalance;
    const columnLooksLikeBalance =
      Math.abs(amount - Math.abs(input.balance)) < 0.051;
    // Only replace when the "amount" column is clearly the running balance
    if (columnLooksLikeBalance && Math.abs(delta) >= 0.01) {
      amount = Math.abs(delta);
      signed = delta;
    }
  }

  const cleaned =
    stripMoneyFromDescription(input.description) ||
    input.description.replace(/\s+/g, " ").trim();

  let credit: number | null = null;
  let debit: number | null = null;

  // Prefer signed direction from running-balance Δ (statement truth).
  if (
    input.balance != null &&
    input.prevBalance != null &&
    Number.isFinite(input.balance) &&
    Number.isFinite(input.prevBalance)
  ) {
    const delta = input.balance - input.prevBalance;
    if (Math.abs(Math.abs(delta) - amount) < 0.051 && Math.abs(delta) >= 0.01) {
      if (delta > 0) credit = amount;
      else debit = amount;
    }
  }

  // Only trust an embedded signed amount when the text itself is negative
  // (positive bare numbers in descriptions are not credit columns).
  if (credit == null && debit == null && signed != null && signed < 0) {
    debit = Math.abs(signed);
  }

  return {
    amount: Math.round(amount * 100) / 100,
    description: cleaned.slice(0, 200),
    credit,
    debit,
  };
}

function enrichRow(
  partial: {
    direction?: "INCOME" | "EXPENSE" | "TRANSFER";
    amount: number;
    description: string;
    bookedAt: string;
    credit?: number | null;
    debit?: number | null;
    balance?: number | null;
    prevBalance?: number | null;
    typeHint?: string | null;
  },
  recurringCounts: Map<string, number>,
): DraftRow {
  const dirRes = classifyDirection({
    description: partial.description,
    amount: partial.amount,
    credit: partial.credit,
    debit: partial.debit,
    balance: partial.balance,
    prevBalance: partial.prevBalance,
    typeHint: partial.typeHint,
  });
  const direction = partial.direction || dirRes.direction;
  const merchantNorm = normalizeMerchant(partial.description);
  const count = (recurringCounts.get(merchantNorm) || 0) + 1;
  recurringCounts.set(merchantNorm, count);

  const cat = resolveCategory(partial.description, direction, {
    recurringCount: count,
  });

  const balAuthoritative = dirRes.evidence.includes("bal:authoritative");
  let confidence = balAuthoritative
    ? 1
    : Math.min(1, (dirRes.confidence + cat.confidence) / 2);
  const needsReview = balAuthoritative
    ? false
    : Boolean(dirRes.needsReview) ||
      dirRes.evidence.some((e) => e.startsWith("fallback:ambiguous")) ||
      confidence < 0.45;
  if (needsReview) {
    confidence = Math.min(confidence, 0.42);
  }

  let balanceDelta: number | null = null;
  if (
    partial.balance != null &&
    partial.prevBalance != null &&
    Number.isFinite(partial.balance) &&
    Number.isFinite(partial.prevBalance)
  ) {
    balanceDelta =
      Math.round((partial.balance - partial.prevBalance) * 100) / 100;
  }

  return {
    direction,
    amount: Math.round(partial.amount * 100) / 100,
    categoryKey: cat.categoryKey,
    categoryLabelHe: cat.categoryLabelHe || categoryLabelHe(cat.categoryKey),
    description: partial.description.slice(0, 200),
    bookedAt: partial.bookedAt,
    merchantNorm,
    confidence: Math.round(confidence * 100) / 100,
    evidence: [...dirRes.evidence, ...cat.evidence],
    recurringHint: cat.recurringHint,
    balance: partial.balance ?? null,
    prevBalance: partial.prevBalance ?? null,
    balanceDelta,
    needsReview: needsReview || undefined,
  };
}

export function markDuplicates(
  draft: DraftRow[],
  existingKeys: Set<string>,
): DraftRow[] {
  return draft.map((row) => {
    const key = `${row.bookedAt.slice(0, 10)}|${row.amount}|${row.merchantNorm}`;
    const duplicate = existingKeys.has(key);
    return { ...row, duplicate };
  });
}

export function draftQuality(draft: DraftRow[]) {
  const income = draft.filter((r) => r.direction === "INCOME").length;
  const expense = draft.filter((r) => r.direction === "EXPENSE").length;
  const transfer = draft.filter((r) => r.direction === "TRANSFER").length;
  const incomeSum = draft
    .filter((r) => r.direction === "INCOME")
    .reduce((s, r) => s + r.amount, 0);
  const expenseSum = draft
    .filter((r) => r.direction === "EXPENSE")
    .reduce((s, r) => s + r.amount, 0);
  const needsReview = draft.filter(
    (r) =>
      r.needsReview ||
      r.confidence < 0.45 ||
      r.duplicate ||
      (r.evidence || []).some((e) => e.startsWith("fallback:ambiguous")),
  ).length;
  const duplicates = draft.filter((r) => r.duplicate).length;

  const withBal = draft.filter(
    (r) => r.balance != null && Number.isFinite(r.balance),
  );
  let statementDelta: number | null = null;
  let signedSum: number | null = null;
  let reconcileWarn: boolean | undefined;
  if (withBal.length >= 2) {
    const first = withBal[0];
    const lastBal = withBal[withBal.length - 1].balance!;
    let firstPrev =
      first.prevBalance != null && Number.isFinite(first.prevBalance)
        ? first.prevBalance!
        : null;
    // Reconstruct opening balance when the first row has no prev.
    if (
      firstPrev == null &&
      first.balance != null &&
      first.balanceDelta != null &&
      Number.isFinite(first.balanceDelta)
    ) {
      firstPrev = first.balance - first.balanceDelta;
    } else if (
      firstPrev == null &&
      first.balance != null &&
      Math.abs(first.amount) >= 0.01
    ) {
      // Assume amount equals |Δ| once direction is known.
      firstPrev =
        first.direction === "INCOME"
          ? first.balance - first.amount
          : first.direction === "EXPENSE"
            ? first.balance + first.amount
            : null;
    }
    if (firstPrev != null) {
      statementDelta = Math.round((lastBal - firstPrev) * 100) / 100;
      signedSum =
        Math.round(
          draft.reduce((s, r) => {
            if (r.direction === "INCOME") return s + r.amount;
            if (r.direction === "EXPENSE") return s - r.amount;
            return s;
          }, 0) * 100,
        ) / 100;
      reconcileWarn = Math.abs(statementDelta - signedSum) > 1;
    }
  }

  return {
    income,
    expense,
    transfer,
    incomeSum: Math.round(incomeSum * 100) / 100,
    expenseSum: Math.round(expenseSum * 100) / 100,
    needsReview,
    duplicates,
    total: draft.length,
    statementDelta,
    signedSum,
    reconcileWarn,
  };
}

const DATE_ALIASES = [
  "date",
  "bookedat",
  "תאריך",
  "תאריך עסקה",
  "תאריך חיוב",
  "תאריך ערך",
  "תאריך רישום",
  "תאריך פעולה",
  "transaction date",
  "value date",
  "posting date",
];
const AMOUNT_ALIASES = [
  "amount",
  "sum",
  "סכום",
  "סכום עסקה",
  "סכום חיוב",
  "סכום בש\"ח",
  "סכום בש״ח",
  "original amount",
];
const DESC_ALIASES = [
  "description",
  "desc",
  "memo",
  "תיאור",
  "פרטים",
  "בית עסק",
  "שם בית העסק",
  "שם בית עסק",
  "תיאור פעולה",
  "תיאור תנועה",
  "פרטי פעולה",
  "merchant",
  "details",
];
const TYPE_ALIASES = ["type", "direction", "סוג", "סוג עסקה", "סוג תנועה"];
const CATEGORY_ALIASES = ["category", "קטגוריה"];
const CREDIT_ALIASES = [
  "credit",
  "זכות",
  "הפקדה",
  "הכנסה",
  "incoming",
  "זיכוי",
];
const DEBIT_ALIASES = [
  "debit",
  "חובה",
  "משיכה",
  "הוצאה",
  "outgoing",
  "חיוב",
  "סכום לחיוב",
];
const BALANCE_ALIASES = [
  "balance",
  "יתרה",
  "יתרה מצטברת",
  "יתרה בש\"ח",
  "יתרה בש״ח",
  "running balance",
];

const TABULAR_ROW_CAP = 2_000;

export function parseCsvTransactions(text: string): DraftRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  return parseTabularTransactions(
    lines.map((line) => splitCsvLine(line)),
    "ייבוא CSV",
  );
}

/**
 * Shared CSV/Excel table parser. Finds a header row (Israeli bank Excel
 * often has title rows first) then maps date / amount / credit / debit.
 */
export function parseTabularTransactions(
  table: string[][],
  fallbackDescription = "ייבוא",
): DraftRow[] {
  if (table.length < 2) return [];
  const headerIdx = findHeaderRowIndex(table);
  if (headerIdx < 0) return [];

  const headerCells = table[headerIdx].map((h) =>
    (h || "").trim().toLowerCase(),
  );
  const idx = {
    date: findCol(headerCells, DATE_ALIASES),
    amount: findCol(headerCells, AMOUNT_ALIASES),
    description: findCol(headerCells, DESC_ALIASES),
    type: findCol(headerCells, TYPE_ALIASES),
    category: findCol(headerCells, CATEGORY_ALIASES),
    credit: findCol(headerCells, CREDIT_ALIASES),
    debit: findCol(headerCells, DEBIT_ALIASES),
    balance: findCol(headerCells, BALANCE_ALIASES),
  };
  if (idx.date < 0 || (idx.amount < 0 && idx.credit < 0 && idx.debit < 0)) {
    return [];
  }

  const recurring = new Map<string, number>();
  const rows: DraftRow[] = [];
  let prevBalance: number | null = null;

  for (const cells of table.slice(headerIdx + 1)) {
    if (rows.length >= TABULAR_ROW_CAP) break;
    const booked = parseDate(cells[idx.date] || "");
    if (!booked) continue;

    const creditRaw =
      idx.credit >= 0 ? parseMoneyCell(cells[idx.credit] || "") : NaN;
    const debitRaw =
      idx.debit >= 0 ? parseMoneyCell(cells[idx.debit] || "") : NaN;
    const balanceRaw =
      idx.balance >= 0 ? parseMoneyCell(cells[idx.balance] || "") : NaN;
    const balance = Number.isFinite(balanceRaw) ? balanceRaw : null;

    if (isSummaryRow(cells, idx.description)) {
      if (balance != null) prevBalance = balance;
      continue;
    }

    let amount = 0;
    let credit: number | null = null;
    let debit: number | null = null;
    let signedFromAmount: number | null = null;

    if (Number.isFinite(creditRaw) && creditRaw > 0) {
      credit = Math.abs(creditRaw);
      amount = credit;
    }
    if (Number.isFinite(debitRaw) && debitRaw > 0) {
      debit = Math.abs(debitRaw);
      amount = debit;
    }

    if (idx.amount >= 0) {
      const parsed = parseMoneyCell(cells[idx.amount] || "");
      if (Number.isFinite(parsed) && parsed !== 0) {
        signedFromAmount = parsed;
        if (amount < 0.01) {
          amount = Math.abs(parsed);
          if (parsed > 0 && credit == null && debit == null) credit = amount;
          if (parsed < 0 && credit == null && debit == null) debit = amount;
        }
      }
    }

    if (
      amount < 0.01 &&
      balance != null &&
      prevBalance != null &&
      Math.abs(balance - prevBalance) >= 0.01
    ) {
      const delta = balance - prevBalance;
      amount = Math.abs(delta);
      if (delta > 0) credit = amount;
      if (delta < 0) debit = amount;
    }

    if (!Number.isFinite(amount) || amount < 0.01) {
      if (balance != null) prevBalance = balance;
      continue;
    }

    // Prefer signed amount columns when credit/debit empty
    if (
      signedFromAmount != null &&
      credit == null &&
      debit == null &&
      Math.abs(signedFromAmount) >= 0.01
    ) {
      if (signedFromAmount > 0) credit = Math.abs(signedFromAmount);
      if (signedFromAmount < 0) debit = Math.abs(signedFromAmount);
    }

    const description =
      (cells[idx.description] || "").trim() || fallbackDescription;
    const typeHint = idx.type >= 0 ? cells[idx.type] : null;

    rows.push(
      enrichRow(
        {
          amount,
          description,
          bookedAt: toLocalDateIso(booked),
          typeHint,
          credit,
          debit,
          balance,
          prevBalance,
        },
        recurring,
      ),
    );
    if (balance != null) prevBalance = balance;
  }
  return rows;
}

function findHeaderRowIndex(table: string[][]): number {
  const limit = Math.min(table.length - 1, 40);
  let bestIdx = -1;
  let bestScore = -1;
  for (let i = 0; i < limit; i++) {
    const score = scoreHeaderRow(table[i] || []);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestScore >= 10 ? bestIdx : -1;
}

function scoreHeaderRow(cells: string[]): number {
  const headers = cells.map((h) => (h || "").trim().toLowerCase());
  if (!headers.some((h) => h.length > 0)) return -1;
  const date = findCol(headers, DATE_ALIASES);
  const amount = findCol(headers, AMOUNT_ALIASES);
  const credit = findCol(headers, CREDIT_ALIASES);
  const debit = findCol(headers, DEBIT_ALIASES);
  if (date < 0 || (amount < 0 && credit < 0 && debit < 0)) return -1;
  let score = 10;
  if (findCol(headers, DESC_ALIASES) >= 0) score += 3;
  if (amount >= 0) score += 2;
  if (credit >= 0) score += 2;
  if (debit >= 0) score += 2;
  if (findCol(headers, BALANCE_ALIASES) >= 0) score += 1;
  if (findCol(headers, TYPE_ALIASES) >= 0) score += 1;
  return score;
}

function parseMoneyCell(raw: string): number {
  const s = raw.replace(/[₪$€,\s]/g, "").replace(/[־–—]/g, "-");
  if (!s) return NaN;
  return Number(s);
}

function isSummaryRow(cells: string[], descriptionIdx: number): boolean {
  const desc = (
    descriptionIdx >= 0 ? cells[descriptionIdx] : cells.join(" ")
  )
    .replace(/\s+/g, " ")
    .trim();
  return /^(סה["״׳']?כ|סהכ|סיכום|totals?|subtotals?|יתרת\s*סגירה|יתרת\s*פתיחה)(?:\s|$)/i.test(
    desc,
  );
}

export function parseUnstructuredText(text: string): DraftRow[] {
  const cleaned = stitchStatementLines(text.replace(/\u00a0/g, " ").trim());
  if (!cleaned) return [];

  const isBankStatement =
    /דף\s*חשבון|יתרה\s*מצטברת|סוג\s*תנועה/i.test(cleaned);

  if (isBankStatement) {
    const bankRows = parseIsraeliBankStatement(cleaned);
    if (bankRows.length) return bankRows;
  }

  const payslip = isBankStatement ? [] : tryParsePayslip(cleaned);
  const lines = parseTransactionLines(cleaned);

  if (lines.length >= 1) {
    if (payslip.length && !lines.some((l) => l.direction === "INCOME")) {
      return [...payslip, ...lines];
    }
    return lines;
  }
  return payslip;
}

function detectNewestFirstStatement(
  rows: Array<{ amount: number; balance: number | null; sourceIndex: number }>,
): boolean {
  const bySource = [...rows].sort((a, b) => a.sourceIndex - b.sourceIndex);
  let newestFirst = 0;
  let oldestFirst = 0;
  for (let i = 0; i < bySource.length - 1; i++) {
    const a = bySource[i];
    const b = bySource[i + 1];
    if (a.balance == null || b.balance == null) continue;
    const d = a.balance - b.balance;
    if (Math.abs(d) < 0.009) continue;
    if (Math.abs(Math.abs(d) - a.amount) < 0.051) newestFirst += 1;
    if (Math.abs(Math.abs(d) - b.amount) < 0.051) oldestFirst += 1;
  }
  if (newestFirst === 0 && oldestFirst === 0) {
    // Israeli "דף חשבון" PDFs are almost always newest → oldest.
    return true;
  }
  return newestFirst >= oldestFirst;
}

/** Oldest → newest by date; reverse same-day when the PDF is newest-first. */
function sortStatementChronological<
  T extends {
    booked: Date;
    amount: number;
    balance: number | null;
    sourceIndex: number;
  },
>(rows: T[]): T[] {
  const newestFirst = detectNewestFirstStatement(rows);
  return [...rows].sort((a, b) => {
    const dt = a.booked.getTime() - b.booked.getTime();
    if (dt !== 0) return dt;
    return newestFirst
      ? b.sourceIndex - a.sourceIndex
      : a.sourceIndex - b.sourceIndex;
  });
}

/**
 * Order rows so each step's running-balance Δ matches that row's amount.
 * Handles bank PDFs where value-date ≠ posting order across pages.
 */
function orderByBalanceChain<
  T extends {
    booked: Date;
    amount: number;
    balance: number | null;
    sourceIndex: number;
  },
>(rows: T[]): T[] {
  if (rows.length <= 1) return rows;
  const newestFirst = detectNewestFirstStatement(rows);
  const indexed = rows.map((r, i) => ({ r, i }));
  const withBal = indexed.filter((x) => x.r.balance != null);
  if (withBal.length < 2) return sortStatementChronological(rows);

  const balRows = withBal.map((x) => x.r);
  const n = balRows.length;

  const successorsOf = (i: number, used: Set<number>): number[] => {
    const out: number[] = [];
    const prevBal = balRows[i].balance!;
    for (let j = 0; j < n; j++) {
      if (j === i || used.has(j)) continue;
      const delta = balRows[j].balance! - prevBal;
      if (Math.abs(Math.abs(delta) - balRows[j].amount) < 0.051) out.push(j);
    }
    return out;
  };

  const predecessorsOf = (j: number): number[] => {
    const out: number[] = [];
    const bal = balRows[j].balance!;
    for (let i = 0; i < n; i++) {
      if (i === j) continue;
      const delta = bal - balRows[i].balance!;
      if (Math.abs(Math.abs(delta) - balRows[j].amount) < 0.051) out.push(i);
    }
    return out;
  };

  const scoreSucc = (from: number, to: number): number => {
    let s = 0;
    const a = balRows[from];
    const b = balRows[to];
    const dayMs = 86_400_000;
    const dateGap = Math.abs(a.booked.getTime() - b.booked.getTime()) / dayMs;
    if (dateGap <= 1) s += 8;
    else if (dateGap <= 3) s += 3;
    const srcGap = Math.abs(a.sourceIndex - b.sourceIndex);
    if (srcGap === 1) s += 20;
    else if (srcGap <= 3) s += 8;
    else if (srcGap <= 8) s += 3;
    // Walking old→new: newer rows appear earlier in a newest-first PDF.
    if (newestFirst && b.sourceIndex < a.sourceIndex) s += 5;
    if (!newestFirst && b.sourceIndex > a.sourceIndex) s += 5;
    return s;
  };

  const pickBest = (from: number, cands: number[]): number => {
    cands.sort((a, b) => {
      const ds = scoreSucc(from, b) - scoreSucc(from, a);
      if (ds !== 0) return ds;
      return balRows[a].sourceIndex - balRows[b].sourceIndex;
    });
    return cands[0];
  };

  const used = new Set<number>();
  const orderedIdx: number[] = [];

  const starts = [];
  for (let j = 0; j < n; j++) {
    if (predecessorsOf(j).length === 0) starts.push(j);
  }
  starts.sort((a, b) => {
    const dt = balRows[a].booked.getTime() - balRows[b].booked.getTime();
    if (dt !== 0) return dt;
    return newestFirst
      ? balRows[b].sourceIndex - balRows[a].sourceIndex
      : balRows[a].sourceIndex - balRows[b].sourceIndex;
  });

  let current =
    starts[0] ??
    [...Array(n).keys()].sort(
      (a, b) => balRows[b].sourceIndex - balRows[a].sourceIndex,
    )[0];

  while (orderedIdx.length < n) {
    used.add(current);
    orderedIdx.push(current);
    const succs = successorsOf(current, used);
    if (succs.length) {
      current = pickBest(current, succs);
      continue;
    }
    const rem = [...Array(n).keys()].filter((i) => !used.has(i));
    if (!rem.length) break;
    // New segment: prefer a remaining node with no unused predecessor.
    const remStarts = rem.filter(
      (j) => predecessorsOf(j).filter((p) => !used.has(p)).length === 0,
    );
    const pool = remStarts.length ? remStarts : rem;
    pool.sort((a, b) => {
      const da = Math.abs(balRows[a].balance! - balRows[current].balance!);
      const db = Math.abs(balRows[b].balance! - balRows[current].balance!);
      if (Math.abs(da - db) > 0.01) return da - db;
      return balRows[a].booked.getTime() - balRows[b].booked.getTime();
    });
    current = pool[0];
  }

  const orderedBal = orderedIdx.map((i) => balRows[i]);
  const out: T[] = [];
  const claimed = new Set<number>();
  for (const row of orderedBal) {
    const hit = indexed.find(
      (x) =>
        !claimed.has(x.i) &&
        x.r.sourceIndex === row.sourceIndex &&
        x.r.balance === row.balance &&
        x.r.amount === row.amount,
    );
    if (hit) {
      claimed.add(hit.i);
      out.push(hit.r);
    }
  }
  for (const x of indexed) {
    if (!claimed.has(x.i)) out.push(x.r);
  }
  return out;
}

function parseIsraeliBankStatement(text: string): DraftRow[] {
  const recurring = new Map<string, number>();
  const parsed: Array<{
    booked: Date;
    description: string;
    amount: number;
    balance: number | null;
    sourceIndex: number;
  }> = [];

  let sourceIndex = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    if (isMetaStatementLine(rawLine)) continue;
    const line = rawLine.replace(/\t+/g, "\t").trim();
    const m = line.match(
      /^(\d{1,2}[./]\d{1,2}[./]\d{2,4})\t+(.+?)\t+(-?[\d,]+(?:\.\d{2})?)\t*₪?\t*(-?[\d,]+(?:\.\d{2})?)\t*₪?\s*$/,
    );
    const m2 = !m
      ? line.match(
          /^(\d{1,2}[./]\d{1,2}[./]\d{2,4})\s+(.+?)\s+(-?[\d,]+(?:\.\d{2})?)\s*₪\s*(-?[\d,]+(?:\.\d{2})?)\s*₪\s*$/,
        )
      : null;
    const hit = m || m2;
    if (!hit) continue;
    const booked = parseDate(hit[1]);
    if (!booked) continue;
    const amount = Math.abs(Number(hit[3].replace(/,/g, "")));
    const balance = Number(hit[4].replace(/,/g, ""));
    const description = hit[2].replace(/\s+/g, " ").trim();
    if (!Number.isFinite(amount) || amount < 0.01) continue;
    parsed.push({
      booked,
      description,
      amount,
      balance: Number.isFinite(balance) ? balance : null,
      sourceIndex: sourceIndex++,
    });
  }

  const ordered = orderByBalanceChain(parsed);
  const rows: DraftRow[] = [];
  let prevBalance: number | null = null;

  for (const row of ordered) {
    const resolved = resolveAmountAndDescription({
      description: row.description,
      columnAmount: row.amount,
      balance: row.balance,
      prevBalance,
    });
    const enriched = enrichRow(
      {
        amount: resolved.amount,
        description: resolved.description,
        bookedAt: toLocalDateIso(row.booked),
        balance: row.balance,
        prevBalance,
        credit: resolved.credit,
        debit: resolved.debit,
      },
      recurring,
    );
    if (row.balance != null) prevBalance = row.balance;
    rows.push(enriched);
  }
  return rows.slice(0, 400);
}

function isMetaStatementLine(rawLine: string): boolean {
  const line = rawLine.replace(/\s+/g, " ").trim();
  if (!line) return true;
  if (/^--\s*\d+\s*of\s*\d+/i.test(line)) return true;
  if (/תאריך\s*הפקה|שם חשבון|מספר חשבון|לתקופה|דף חשבון/i.test(line))
    return true;
  if (/תאריך\s+סוג תנועה|יתרה\s*מצטברת/i.test(line)) return true;
  if (/לא כולל תנועות|ממתינות לביצוע/i.test(line)) return true;
  return false;
}

function tryParsePayslip(text: string): DraftRow[] {
  const looksLikePayslip =
    /תלוש|שכר\s*נטו|נטו\s*לתשלום|payslip/i.test(text) &&
    !/דף\s*חשבון|יתרה\s*מצטברת/i.test(text);
  if (!looksLikePayslip) return [];

  const patterns = [
    /נטו\s*לתשלום[:\s]*₪?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /שכר\s*נטו[:\s]*₪?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /סך\s*הכל\s*נטו[:\s]*₪?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /net\s*pay[:\s]*₪?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];

  let amount: number | null = null;
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) {
        amount = n;
        break;
      }
    }
  }
  if (!amount) return [];

  const period = text.match(
    /(?:לחודש|תקופה|period)[:\s]*(\d{1,2})[./](\d{4})/i,
  );
  let booked = new Date();
  if (period) {
    booked = new Date(Number(period[2]), Number(period[1]) - 1, 1);
  } else {
    booked = new Date(booked.getFullYear(), booked.getMonth(), 1);
  }

  const recurring = new Map<string, number>();
  return [
    enrichRow(
      {
        direction: "INCOME",
        amount,
        description: "משכורת (מתלוש)",
        bookedAt: toLocalDateIso(booked),
        typeHint: "income",
      },
      recurring,
    ),
  ];
}

function parseTransactionLines(text: string): DraftRow[] {
  type RawLine = {
    booked: Date;
    description: string;
    amount: number | null;
    balance: number | null;
    sourceIndex: number;
  };
  const raw: RawLine[] = [];
  let sourceIndex = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    if (isMetaStatementLine(rawLine)) continue;
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 6) continue;

    const dateMatch = line.match(
      /(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2})/,
    );
    if (!dateMatch) continue;
    const booked = parseDate(dateMatch[1]);
    if (!booked) continue;

    const withoutDates = line.replace(
      /\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2}/g,
      " ",
    );
    const moneyTokens = [
      ...withoutDates.matchAll(
        /(-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|-?\d+\.\d{2})/g,
      ),
    ].map((x) => Number(x[1].replace(/,/g, "")));
    const validMoney = moneyTokens.filter(
      (n) => Number.isFinite(n) && Math.abs(n) >= 1,
    );
    if (!validMoney.length) continue;

    let amount: number | null = null;
    let balance: number | null = null;
    if (validMoney.length >= 2) {
      balance = validMoney[validMoney.length - 1];
      amount = Math.abs(validMoney[validMoney.length - 2]);
    } else {
      amount = Math.abs(validMoney[0]);
    }

    // Keep money tokens in description so resolveAmountAndDescription can
    // prefer embedded tx amounts over a collapsed balance column.
    const description = withoutDates
      .replace(/\b\d{5,}\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!description || description.length < 2) continue;
    raw.push({
      booked,
      description,
      amount,
      balance,
      sourceIndex: sourceIndex++,
    });
  }

  const ordered = orderByBalanceChain(
    raw.map((r) => ({ ...r, amount: r.amount ?? 0 })),
  );
  for (let i = 0; i < ordered.length; i++) {
    const row = ordered[i];
    if (row.amount != null && row.amount > 0) continue;
    if (row.balance == null) continue;
    const prev = [...ordered.slice(0, i)].reverse().find((r) => r.balance != null);
    if (!prev || prev.balance == null) continue;
    const delta = row.balance - prev.balance;
    if (Math.abs(delta) < 1) continue;
    row.amount = Math.abs(delta);
  }

  const recurring = new Map<string, number>();
  const rows: DraftRow[] = [];
  let prevBalance: number | null = null;
  for (const row of ordered) {
    if (row.amount == null || row.amount < 0.01) continue;
    const resolved = resolveAmountAndDescription({
      description: row.description,
      columnAmount: row.amount,
      balance: row.balance,
      prevBalance,
    });
    // If description had no money but we already stripped in parse — keep column
    const amount = resolved.amount;
    const description =
      resolved.description.length >= 2
        ? resolved.description
        : row.description;
    const enriched = enrichRow(
      {
        amount,
        description,
        bookedAt: toLocalDateIso(row.booked),
        balance: row.balance,
        prevBalance,
        credit: resolved.credit,
        debit: resolved.debit,
      },
      recurring,
    );
    if (row.balance != null) prevBalance = row.balance;
    rows.push(enriched);
  }
  return rows.slice(0, 400);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if ((ch === "," || ch === ";") && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function findCol(headers: string[], aliases: string[]) {
  const exact = headers.findIndex((h) => aliases.some((a) => h === a));
  if (exact >= 0) return exact;
  return headers.findIndex((h) =>
    aliases.some((a) => a.length >= 2 && h.includes(a)),
  );
}

function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s + "T12:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day, 12, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Unformatted Excel serial in a date column (days since 1899-12-30).
  if (/^\d{5}(?:\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial >= 20000 && serial <= 80000) {
      const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000));
      if (!Number.isNaN(utc.getTime())) {
        return new Date(
          utc.getUTCFullYear(),
          utc.getUTCMonth(),
          utc.getUTCDate(),
          12,
          0,
          0,
        );
      }
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
