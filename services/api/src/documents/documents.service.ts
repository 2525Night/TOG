import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { promises as fs } from "fs";
import * as path from "path";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { classifyDirection } from "./direction-classifier";
import {
  categoryLabelHe,
  resolveCategory,
} from "./category-resolver";
import {
  DraftRow,
  detectKind,
  detectStatementPeriod,
  draftQuality,
  extractTextFromImage,
  extractTextFromPdf,
  markDuplicates,
  parseCsvTransactions,
  parseUnstructuredText,
} from "./extract";

export type ConfirmOverride = {
  index: number;
  direction?: "INCOME" | "EXPENSE" | "TRANSFER";
  categoryKey?: string;
  description?: string;
};

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  private uploadRoot() {
    return path.join(process.cwd(), ".data", "uploads");
  }

  list(userId: string) {
    return this.prisma.document
      .findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sourceKind: true,
          storageMode: true,
          status: true,
          importedCount: true,
          filePath: true,
          createdAt: true,
          updatedAt: true,
        },
      })
      .then((rows) =>
        rows.map((d) => ({
          id: d.id,
          originalName: d.originalName,
          mimeType: d.mimeType,
          sourceKind: d.sourceKind,
          storageMode: d.storageMode,
          status: d.status,
          importedCount: d.importedCount,
          fileKept: d.storageMode === "PERMANENT" && !!d.filePath,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
      );
  }

  async get(userId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
    });
    if (!doc) throw new NotFoundException("מסמך לא נמצא");
    const draft = doc.draftJson
      ? (JSON.parse(doc.draftJson) as DraftRow[])
      : [];
    return {
      ...doc,
      draft,
      quality: draft.length ? draftQuality(draft) : null,
    };
  }

  async upload(
    userId: string,
    file: Express.Multer.File,
    storageMode: "TEMPORARY" | "PERMANENT" = "TEMPORARY",
  ) {
    if (!file) throw new BadRequestException("לא הועלה קובץ");
    const MAX_BYTES = 8 * 1024 * 1024;
    if (file.size > MAX_BYTES || (file.buffer?.length ?? 0) > MAX_BYTES) {
      throw new BadRequestException(
        "הקובץ גדול מדי (מקסימום 8MB). העלו קובץ קטן יותר או CSV מצומצם.",
      );
    }
    const originalName = file.originalname || "upload";
    const mimeType = file.mimetype || "application/octet-stream";
    const kind = detectKind(originalName, mimeType);
    if (!kind) {
      throw new BadRequestException(
        "סוג קובץ לא נתמך. העלו CSV, PDF או תמונה (PNG/JPG/WEBP).",
      );
    }

    let text = "";
    let draft: DraftRow[] = [];

    try {
      if (kind === "csv") {
        text = file.buffer.toString("utf8");
        draft = parseCsvTransactions(text);
      } else if (kind === "pdf") {
        text = await extractTextFromPdf(file.buffer);
        if (text.replace(/\s/g, "").length < 20) {
          throw new BadRequestException(
            "לא הצלחנו לקרוא את ה־PDF. אם זה סריקה או צילום — העלו תמונה חדה של הדף, או ייצאו CSV מהבנק.",
          );
        }
        draft = parseUnstructuredText(text);
      } else {
        text = await extractTextFromImage(file.buffer);
        if (text.replace(/\s/g, "").length < 8) {
          throw new BadRequestException(
            "לא זיהינו טקסט בתמונה. העלו תמונה חדה יותר, או ייצאו CSV מהבנק.",
          );
        }
        draft = parseUnstructuredText(text);
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const code = err instanceof Error ? err.message : "";
      if (code.startsWith("PDF_TOO_MANY_PAGES")) {
        throw new BadRequestException(
          "ה־PDF ארוך מדי לייבוא. ייצאו CSV מהבנק, או העלו עד 20 עמודים.",
        );
      }
      if (code === "PDF_TIMEOUT") {
        throw new BadRequestException(
          "קריאת ה־PDF ארכה יותר מדי. נסו קובץ קצר יותר, או ייצאו CSV מהבנק.",
        );
      }
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          evt: "document_extract_failed",
          kind,
          bytes: file.size,
          code: code.slice(0, 80),
        }),
      );
      throw new BadRequestException(
        kind === "pdf"
          ? "לא הצלחנו לקרוא את ה־PDF. נסו CSV מהבנק או תמונה חדה של הדף."
          : "חילוץ המסמך נכשל. נסו קובץ אחר או CSV מהבנק.",
      );
    }

    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        evt: "document_extract_ok",
        kind,
        textChars: text.replace(/\s/g, "").length,
        draftRows: draft.length,
      }),
    );

    if (draft.length === 0) {
      throw new BadRequestException(
        kind === "csv"
          ? "לא זוהו תנועות ב־CSV. צפו עמודות: תאריך, סכום, תיאור."
          : kind === "pdf"
            ? "הקובץ נפתח אבל לא זיהינו תנועות. ייצאו CSV מהבנק (תאריך, סכום, תיאור)."
            : "התמונה נקראה אבל לא זיהינו תנועות. נסו תמונה חדה יותר או CSV.",
      );
    }

    const period = detectStatementPeriod(text);
    draft = await this.applyMerchantMemory(userId, draft);
    draft = await this.withDuplicates(userId, draft);
    const quality = draftQuality(draft);

    await fs.mkdir(this.uploadRoot(), { recursive: true });
    const storedName = `${userId}-${Date.now()}-${sanitize(originalName)}`;
    const filePath = path.join(this.uploadRoot(), storedName);

    if (storageMode === "PERMANENT") {
      await fs.writeFile(filePath, file.buffer);
    }

    const doc = await this.prisma.document.create({
      data: {
        userId,
        originalName,
        mimeType,
        sourceKind: kind,
        storageMode,
        status: "EXTRACTED",
        filePath: storageMode === "PERMANENT" ? filePath : null,
        rawText:
          storageMode === "TEMPORARY"
            ? text.slice(0, 100_000)
            : text.slice(0, 40_000),
        draftJson: JSON.stringify(draft).slice(0, 1_500_000),
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: "DOCUMENT_UPLOADED",
        meta: JSON.stringify({
          documentId: doc.id,
          rows: draft.length,
          storageMode,
          sourceKind: kind,
          quality,
          period,
        }),
      },
    });

    return {
      id: doc.id,
      originalName: doc.originalName,
      status: doc.status,
      storageMode: doc.storageMode,
      sourceKind: kind,
      draft,
      quality,
      period,
    };
  }

  async confirm(
    userId: string,
    id: string,
    selectedIndexes?: number[],
    overrides?: ConfirmOverride[],
  ) {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
    });
    if (!doc) throw new NotFoundException("מסמך לא נמצא");
    if (doc.status === "CONFIRMED") {
      return { ok: true, alreadyConfirmed: true };
    }
    let draft = (doc.draftJson ? JSON.parse(doc.draftJson) : []) as DraftRow[];

    if (overrides?.length) {
      const byIndex = new Map(overrides.map((o) => [o.index, o]));
      draft = draft.map((row, i) => {
        const o = byIndex.get(i);
        if (!o) return row;
        const direction = o.direction || row.direction;
        const description = o.description ?? row.description;
        const categoryKey = o.categoryKey || row.categoryKey;
        const cat = resolveCategory(description, direction);
        return {
          ...row,
          direction,
          description,
          categoryKey,
          categoryLabelHe: categoryLabelHe(categoryKey),
          merchantNorm: cat.merchantNorm || row.merchantNorm,
          confidence: 1,
          evidence: [...(row.evidence || []), "user:override"],
        };
      });
    }

    const rows =
      selectedIndexes && selectedIndexes.length
        ? selectedIndexes.map((i) => draft[i]).filter(Boolean)
        : draft.filter((r) => !r.duplicate);
    if (!rows.length) throw new BadRequestException("אין שורות לאישור");

    let account = await this.prisma.financialAccount.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (!account) {
      account = await this.prisma.financialAccount.create({
        data: {
          userId,
          name: "חשבון מיובא",
          kind: "BANK",
          currentBalance: new Prisma.Decimal(0),
          sourceType: "FILE_UPLOAD",
          userConfirmed: true,
        },
      });
    }

    let balanceDelta = 0;
    const createData = rows.map((row) => {
      if (row.direction === "INCOME") balanceDelta += row.amount;
      else if (row.direction === "EXPENSE") balanceDelta -= row.amount;
      return {
        userId,
        accountId: account!.id,
        direction: row.direction,
        amount: new Prisma.Decimal(row.amount),
        categoryKey: row.categoryKey,
        description: row.description,
        merchantNorm: row.merchantNorm || null,
        bookedAt: new Date(row.bookedAt),
        sourceType: "FILE_UPLOAD" as const,
        sourceReference: doc.id,
        confidence: row.confidence ?? null,
        userConfirmed: true,
      };
    });

    await this.prisma.$transaction([
      this.prisma.transaction.createMany({ data: createData }),
      this.prisma.financialAccount.update({
        where: { id: account.id },
        data: { currentBalance: { increment: balanceDelta } },
      }),
    ]);

    const keepFile = doc.storageMode === "PERMANENT";

    await this.prisma.document.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        importedCount: rows.length,
        draftJson: null,
        rawText: keepFile ? doc.rawText : null,
        filePath: keepFile ? doc.filePath : null,
      },
    });

    if (!keepFile && doc.filePath) {
      await fs.unlink(doc.filePath).catch(() => undefined);
    }

    const defaultMonth =
      rows
        .map((r) => r.bookedAt.slice(0, 7))
        .sort()
        .at(-1) || undefined;

    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: "DOCUMENT_CONFIRMED",
        meta: JSON.stringify({
          documentId: id,
          imported: rows.length,
          fileKept: keepFile,
          sourceKind: doc.sourceKind,
          defaultMonth,
        }),
      },
    });

    return {
      ok: true,
      imported: rows.length,
      fileKept: keepFile,
      defaultMonth,
    };
  }

  async reject(userId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
    });
    if (!doc) throw new NotFoundException("מסמך לא נמצא");
    await this.prisma.document.update({
      where: { id },
      data: {
        status: "REJECTED",
        draftJson: null,
        rawText: null,
        filePath: null,
        importedCount: null,
      },
    });
    if (doc.filePath) {
      await fs.unlink(doc.filePath).catch(() => undefined);
    }
    return { ok: true };
  }

  /** Remove transactions created from this document and reverse account balance. */
  async undoImport(userId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
    });
    if (!doc) throw new NotFoundException("מסמך לא נמצא");

    const txs = await this.prisma.transaction.findMany({
      where: { userId, sourceReference: id },
    });
    let balanceDelta = 0;
    const accountIds = new Set<string>();
    for (const t of txs) {
      const amt = Number(t.amount);
      if (t.direction === "INCOME") balanceDelta -= amt;
      if (t.direction === "EXPENSE") balanceDelta += amt;
      if (t.accountId) accountIds.add(t.accountId);
    }

    await this.prisma.transaction.deleteMany({
      where: { userId, sourceReference: id },
    });

    if (accountIds.size === 1) {
      const accountId = [...accountIds][0];
      await this.prisma.financialAccount.update({
        where: { id: accountId },
        data: { currentBalance: { increment: balanceDelta } },
      });
    } else if (accountIds.size > 1) {
      for (const accountId of accountIds) {
        const subset = txs.filter((t) => t.accountId === accountId);
        let d = 0;
        for (const t of subset) {
          const amt = Number(t.amount);
          if (t.direction === "INCOME") d -= amt;
          if (t.direction === "EXPENSE") d += amt;
        }
        await this.prisma.financialAccount.update({
          where: { id: accountId },
          data: { currentBalance: { increment: d } },
        });
      }
    }

    await this.prisma.document.update({
      where: { id },
      data: {
        status: "REJECTED",
        importedCount: null,
        draftJson: null,
        rawText: null,
        filePath: null,
      },
    });
    if (doc.filePath) {
      await fs.unlink(doc.filePath).catch(() => undefined);
    }

    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: "DOCUMENT_IMPORT_UNDONE",
        meta: JSON.stringify({ documentId: id, removed: txs.length }),
      },
    });

    return { ok: true, removed: txs.length };
  }

  private async withDuplicates(userId: string, draft: DraftRow[]) {
    const dates = draft
      .map((r) => new Date(r.bookedAt).getTime())
      .filter((n) => !Number.isNaN(n));
    const minT = dates.length ? Math.min(...dates) : Date.now();
    const maxT = dates.length ? Math.max(...dates) : Date.now();
    const from = new Date(minT);
    from.setMonth(from.getMonth() - 1);
    const to = new Date(maxT);
    to.setMonth(to.getMonth() + 2);

    const existing = await this.prisma.transaction.findMany({
      where: {
        userId,
        bookedAt: { gte: from, lt: to },
      },
      select: {
        bookedAt: true,
        amount: true,
        merchantNorm: true,
        description: true,
      },
      take: 3000,
    });
    const keys = new Set(
      existing.map((t) => {
        const day = t.bookedAt.toISOString().slice(0, 10);
        const amt = Number(t.amount);
        const norm =
          t.merchantNorm ||
          (t.description || "").toLowerCase().slice(0, 80);
        return `${day}|${amt}|${norm}`;
      }),
    );
    return markDuplicates(draft, keys);
  }

  private async applyMerchantMemory(
    userId: string,
    draft: DraftRow[],
  ): Promise<DraftRow[]> {
    const norms = [
      ...new Set(draft.map((d) => d.merchantNorm).filter(Boolean)),
    ];
    if (!norms.length) return draft;

    const past = await this.prisma.transaction.findMany({
      where: {
        userId,
        merchantNorm: { in: norms },
        userConfirmed: true,
      },
      orderBy: { bookedAt: "desc" },
      take: 800,
      select: {
        merchantNorm: true,
        direction: true,
        categoryKey: true,
      },
    });

    const memDir = new Map<string, DraftRow["direction"]>();
    const memCat = new Map<string, string>();
    for (const t of past) {
      if (!t.merchantNorm) continue;
      if (!memDir.has(t.merchantNorm)) {
        memDir.set(
          t.merchantNorm,
          t.direction as DraftRow["direction"],
        );
      }
      if (!memCat.has(t.merchantNorm)) {
        memCat.set(t.merchantNorm, t.categoryKey);
      }
    }

    return draft.map((row) => {
      const rememberedDirection = memDir.get(row.merchantNorm) || null;
      const rememberedCategory = memCat.get(row.merchantNorm) || null;
      if (!rememberedDirection && !rememberedCategory) return row;

      const dirRes = classifyDirection({
        description: row.description,
        amount: row.amount,
        balance: row.balance,
        prevBalance: row.prevBalance,
        rememberedDirection,
      });
      const direction = dirRes.direction;
      const cat = resolveCategory(row.description, direction, {
        rememberedCategoryKey: rememberedCategory,
      });
      const needsReview =
        Boolean(dirRes.needsReview) ||
        Boolean(row.needsReview) ||
        dirRes.evidence.some((e) => e.startsWith("fallback:ambiguous"));
      let confidence = Math.min(
        1,
        Math.round(((dirRes.confidence + cat.confidence) / 2) * 100) / 100,
      );
      if (needsReview) confidence = Math.min(confidence, 0.42);
      return {
        ...row,
        direction,
        categoryKey: cat.categoryKey,
        categoryLabelHe: cat.categoryLabelHe,
        merchantNorm: cat.merchantNorm || row.merchantNorm,
        confidence,
        evidence: [
          ...row.evidence,
          ...dirRes.evidence,
          ...cat.evidence,
        ],
        recurringHint: cat.recurringHint || row.recurringHint,
        needsReview: needsReview || undefined,
      };
    });
  }
}

function sanitize(name: string) {
  return name.replace(/[^\w.\-()+\u0590-\u05FF]+/g, "_").slice(0, 80);
}
