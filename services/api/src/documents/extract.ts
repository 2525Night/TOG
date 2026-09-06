import { classifyDirection } from "./direction-classifier";
import {
  categoryLabelHe,
  normalizeMerchant,
  resolveCategory,
} from "./category-resolver";

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
};

export type DetectedKind = "csv" | "pdf" | "image";

export type ExtractMeta = {
  statementFrom?: string;
  statementTo?: string;
  defaultMonth?: string;
};

export function detectKind(
  originalName: string,
  mimeType: string,
): DetectedKind | null {
  const lower = (originalName || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  if (
    lower.endsWith(".csv") ||
    mime === "text/csv" ||
    mime === "application/vnd.ms-excel"
  ) {
    return "csv";
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
  return null;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require("pdf-parse") as {
    PDFParse: new (opts: { data: Buffer | Uint8Array }) => {
      getText: () => Promise<{ text: string }>;
      getScreenshot: (opts?: {
        partial?: number[];
        imageBuffer?: boolean;
        scale?: number;
      }) => Promise<{
        pages: Array<{ data?: Uint8Array; dataUrl?: string }>;
      }>;
      destroy: () => Promise<void>;
    };
  };

  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    let text = (result.text || "").trim();

    if (text.replace(/\s/g, "").length < 40) {
      try {
        const shots = await parser.getScreenshot({
          partial: [1, 2],
          imageBuffer: true,
          scale: 2,
        });
        const ocrParts: string[] = [];
        for (const page of shots.pages || []) {
          if (!page.data) continue;
          const pageText = await extractTextFromImage(Buffer.from(page.data));
          if (pageText) ocrParts.push(pageText);
        }
        if (ocrParts.length) text = ocrParts.join("\n");
      } catch {
        /* keep */
      }
    }
    return text.trim();
  } finally {
    await parser.destroy().catch(() => undefined);
  }
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
  if (signed != null) {
    if (signed > 0) credit = Math.abs(signed);
    if (signed < 0) debit = Math.abs(signed);
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

  const confidence = Math.min(
    1,
    (dirRes.confidence + cat.confidence) / 2,
  );

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
  const needsReview = draft.filter(
    (r) => r.confidence < 0.45 || r.duplicate,
  ).length;
  const duplicates = draft.filter((r) => r.duplicate).length;
  return { income, expense, transfer, needsReview, duplicates, total: draft.length };
}

export function parseCsvTransactions(text: string): DraftRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headerCells = splitCsvLine(lines[0]).map((h) =>
    h.trim().toLowerCase(),
  );
  const idx = {
    date: findCol(headerCells, ["date", "bookedat", "תאריך"]),
    amount: findCol(headerCells, ["amount", "sum", "סכום"]),
    description: findCol(headerCells, [
      "description",
      "desc",
      "memo",
      "תיאור",
      "פרטים",
    ]),
    type: findCol(headerCells, ["type", "direction", "סוג"]),
    category: findCol(headerCells, ["category", "קטגוריה"]),
  };
  if (idx.date < 0 || idx.amount < 0) return [];

  const recurring = new Map<string, number>();
  const rows: DraftRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const amountRaw = (cells[idx.amount] || "").replace(/[₪,\s]/g, "");
    let amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount === 0) continue;
    amount = Math.abs(amount);

    const booked = parseDate(cells[idx.date] || "");
    if (!booked) continue;

    const description = (cells[idx.description] || "").trim() || "ייבוא CSV";
    const typeHint = idx.type >= 0 ? cells[idx.type] : null;

    rows.push(
      enrichRow(
        {
          amount,
          description,
          bookedAt: toLocalDateIso(booked),
          typeHint,
        },
        recurring,
      ),
    );
  }
  return rows;
}

export function parseUnstructuredText(text: string): DraftRow[] {
  const cleaned = text.replace(/\u00a0/g, " ").trim();
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

function parseIsraeliBankStatement(text: string): DraftRow[] {
  const recurring = new Map<string, number>();
  const parsed: Array<{
    booked: Date;
    description: string;
    amount: number;
    balance: number | null;
  }> = [];

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
    });
  }

  parsed.sort((a, b) => a.booked.getTime() - b.booked.getTime());
  const rows: DraftRow[] = [];
  const seen = new Set<string>();
  let prevBalance: number | null = null;

  for (const row of parsed) {
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
    const key = `${enriched.bookedAt}|${enriched.amount}|${enriched.merchantNorm}|${enriched.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
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
  };
  const raw: RawLine[] = [];

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
    raw.push({ booked, description, amount, balance });
  }

  raw.sort((a, b) => a.booked.getTime() - b.booked.getTime());
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (row.amount != null && row.amount > 0) continue;
    if (row.balance == null) continue;
    const prev = [...raw.slice(0, i)].reverse().find((r) => r.balance != null);
    if (!prev || prev.balance == null) continue;
    const delta = row.balance - prev.balance;
    if (Math.abs(delta) < 1) continue;
    row.amount = Math.abs(delta);
  }

  const recurring = new Map<string, number>();
  const rows: DraftRow[] = [];
  const seen = new Set<string>();
  let prevBalance: number | null = null;
  for (const row of raw) {
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
    const key = `${enriched.bookedAt}|${enriched.amount}|${enriched.merchantNorm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(enriched);
  }
  return rows.slice(0, 300);
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
  return headers.findIndex((h) =>
    aliases.some((a) => h === a || h.includes(a)),
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
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
