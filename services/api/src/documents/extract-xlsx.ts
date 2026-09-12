/**
 * Spreadsheet statement import (xlsx / xlsm / xls / xlsb / ods).
 * Pure JS via SheetJS — safe on Vercel serverless (no native bindings).
 */

import * as XLSX from "xlsx";
import { DraftRow, parseTabularTransactions } from "./extract";

const MAX_SHEET_ROWS = 8_000;
const MAX_COLS = 40;

export function extractExcel(buffer: Buffer): {
  draft: DraftRow[];
  text: string;
} {
  const sheets = readSpreadsheetSheets(buffer);
  if (!sheets.length) return { draft: [], text: "" };

  let best: DraftRow[] = [];
  for (const sheet of sheets) {
    const rows = parseTabularTransactions(sheet.rows, "ייבוא אקסל");
    if (rows.length > best.length) best = rows;
  }
  return { draft: best, text: previewFromSheets(sheets) };
}

export function parseExcelTransactions(buffer: Buffer): DraftRow[] {
  return extractExcel(buffer).draft;
}

function previewFromSheets(
  sheets: Array<{ name: string; rows: string[][] }>,
): string {
  const chunks: string[] = [];
  for (const sheet of sheets) {
    chunks.push(`# ${sheet.name}`);
    for (const row of sheet.rows.slice(0, 80)) {
      chunks.push(row.join("\t"));
    }
  }
  return chunks.join("\n").slice(0, 100_000);
}

export function readSpreadsheetSheets(
  buffer: Buffer,
): Array<{ name: string; rows: string[][] }> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      cellNF: true,
      cellText: false,
    });
  } catch (err) {
    throw new Error("EXCEL_UNREADABLE", { cause: err });
  }

  const sheets: Array<{ name: string; rows: string[][] }> = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = sheetToStringRows(sheet);
    if (rows.length >= 2) sheets.push({ name, rows });
  }
  return sheets;
}

function sheetToStringRows(sheet: XLSX.WorkSheet): string[][] {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const lastRow = Math.min(range.e.r, range.s.r + MAX_SHEET_ROWS - 1);
  const lastCol = Math.min(range.e.c, range.s.c + MAX_COLS - 1);
  const rows: string[][] = [];

  for (let r = range.s.r; r <= lastRow; r++) {
    const row: string[] = [];
    let empty = true;
    for (let c = range.s.c; c <= lastCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const text = cellToString(sheet[addr] as XLSX.CellObject | undefined);
      if (text) empty = false;
      row.push(text);
    }
    if (!empty) rows.push(row);
  }
  return rows;
}

function cellToString(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  if (cell.t === "d") {
    const d = coerceDate(cell.v);
    return d ? formatYmd(d) : String(cell.w || cell.v || "").trim();
  }
  if (cell.t === "n" && typeof cell.v === "number" && Number.isFinite(cell.v)) {
    const fmt = String(cell.z || "");
    if (looksLikeExcelDateFormat(fmt)) {
      const d = excelSerialToDate(cell.v);
      if (d) return formatYmd(d);
    }
    return stringifyNumber(cell.v);
  }
  if (cell.t === "b") return cell.v ? "true" : "false";
  if (cell.t === "s") return String(cell.v ?? "").trim();
  if (cell.w) return String(cell.w).trim();
  if (cell.v != null) return String(cell.v).trim();
  return "";
}

function looksLikeExcelDateFormat(fmt: string): boolean {
  if (!fmt) return false;
  if (/[\[\$€]|0\.0|#,#/.test(fmt) && !/[ymd]/i.test(fmt)) return false;
  return /[ymd]/i.test(fmt);
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialToDate(value);
  }
  return null;
}

/** Excel 1900 date system: serial days since 1899-12-30. */
export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 120_000) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + Math.round(serial * 86_400_000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function stringifyNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 1_000_000) / 1_000_000;
  return String(rounded);
}
