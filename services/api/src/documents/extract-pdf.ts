/**
 * Serverless PDF text extraction without native canvas.
 * Reconstructs table rows from PDF.js text items (x/y) so Israeli bank
 * statements parse as lines instead of one cell per row.
 */

import {
  extractText,
  extractTextItems,
  getDocumentProxy,
} from "unpdf";

export type PdfTextItem = { str: string; x: number; y: number };

export const MAX_PDF_PAGES = 20;
const EXTRACT_TIMEOUT_MS = 8_000;

export function clusterTextItemsToLines(
  items: PdfTextItem[],
  yTol = 4,
): string[] {
  const buckets: { y: number; items: PdfTextItem[] }[] = [];
  for (const raw of items) {
    const str = (raw.str || "").replace(/\s+/g, " ").trim();
    if (!str) continue;
    const x = Number(raw.x);
    const y = Number(raw.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const hit = buckets.find((b) => Math.abs(b.y - y) <= yTol);
    if (hit) hit.items.push({ str, x, y });
    else buckets.push({ y, items: [{ str, x, y }] });
  }
  buckets.sort((a, b) => b.y - a.y);
  return buckets
    .map((b) =>
      b.items
        .sort((a, c) => a.x - c.x)
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function withTimeout<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function itemToPoint(item: {
  str?: string;
  x?: number;
  y?: number;
}): PdfTextItem | null {
  const str = (item.str || "").trim();
  if (!str) return null;
  const x = Number(item.x);
  const y = Number(item.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { str, x, y };
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const pdf = await withTimeout(
    getDocumentProxy(data),
    EXTRACT_TIMEOUT_MS,
    "PDF_TIMEOUT",
  );

  try {
    const pages = Number(pdf.numPages) || 0;
    if (pages < 1) return "";
    if (pages > MAX_PDF_PAGES) {
      throw new Error(`PDF_TOO_MANY_PAGES:${pages}`);
    }

    let clustered = "";
    try {
      const { items } = await withTimeout(
        extractTextItems(pdf),
        EXTRACT_TIMEOUT_MS,
        "PDF_TIMEOUT",
      );
      const lines: string[] = [];
      for (const pageItems of items || []) {
        const points = (pageItems || [])
          .map((it) => itemToPoint(it))
          .filter((p): p is PdfTextItem => p != null);
        lines.push(...clusterTextItemsToLines(points));
      }
      clustered = lines.join("\n").trim();
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("PDF_")) throw err;
      clustered = "";
    }

    if (clustered.replace(/\s/g, "").length >= 40) return clustered;

    const fallback = await withTimeout(
      extractText(pdf, { mergePages: true }),
      EXTRACT_TIMEOUT_MS,
      "PDF_TIMEOUT",
    );
    const plain = Array.isArray(fallback.text)
      ? fallback.text.join("\n")
      : fallback.text || "";
    const trimmed = plain.trim();
    if (trimmed.replace(/\s/g, "").length > clustered.replace(/\s/g, "").length) {
      return trimmed;
    }
    return clustered || trimmed;
  } finally {
    const destroy = (
      pdf as { destroy?: () => Promise<unknown> | unknown }
    ).destroy;
    if (typeof destroy === "function") {
      await Promise.resolve(destroy.call(pdf)).catch(() => undefined);
    }
  }
}
