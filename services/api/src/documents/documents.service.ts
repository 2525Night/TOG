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
            "לא חולץ טקסט מה־PDF (ייתכן שמדובר בסריקה בלבד). נסו תמונה ברורה או CSV.",
          );
        }
        draft = parseUnstructuredText(text);
      } else {
        text = await extractTextFromImage(file.buffer);
        if (text.replace(/\s/g, "").length < 8) {
          throw new BadRequestException(
            "OCR לא זיהה טקסט בתמונה. העלו תמונה חדה יותר או CSV.",
          );
        }
        draft = parseUnstructuredText(text);
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const message =
        err instanceof Error ? err.message : "כשל בחילוץ מהמסמך";
      throw new BadRequestException(`חילוץ נכשל: ${message}`);
    }

    if (draft.length === 0) {
      throw new BadRequestException(
        kind === "csv"
          ? "לא זוהו תנועות ב־CSV. צפו עמודות: date,amount,description או תאריך,סכום,תיאור"
          : "חולץ טקסט אך לא זוהו תנועות/תלוש לאישור. בדקו שהמסמך כולל תאריכים וסכומים ברורים.",
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
            ? text.slice(0, 200_000)
            : text.slice(0, 50_000),
        draftJson: JSON.stringify(draft),
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
        rememberedDirection,
      });
      const direction = dirRes.direction;
      const cat = resolveCategory(row.description, direction, {
        rememberedCategoryKey: rememberedCategory,
      });
      return {
        ...row,
        direction,
        categoryKey: cat.categoryKey,
        categoryLabelHe: cat.categoryLabelHe,
        merchantNorm: cat.merchantNorm || row.merchantNorm,
        confidence: Math.min(
          1,
          Math.round(((dirRes.confidence + cat.confidence) / 2) * 100) / 100,
        ),
        evidence: [
          ...row.evidence,
          ...dirRes.evidence,
          ...cat.evidence,
        ],
        recurringHint: cat.recurringHint || row.recurringHint,
      };
    });
  }
}

function sanitize(name: string) {
  return name.replace(/[^\w.\-()+\u0590-\u05FF]+/g, "_").slice(0, 80);
}
