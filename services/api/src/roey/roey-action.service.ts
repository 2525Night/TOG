import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { SourceType } from "@prisma/client";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from "@moneytail/shared";
import { randomUUID } from "node:crypto";
import { BudgetService } from "../budget/budget.service";
import { GoalsService } from "../goals/goals.service";
import { PrismaService } from "../prisma/prisma.service";
import { TransactionsService } from "../transactions/transactions.service";
import {
  ApproveRoeyActionDto,
  CreateRoeyActionProposalDto,
  RejectRoeyActionDto,
} from "./roey-action.dto";
import { classifyActionImpact } from "./roey-action.policy";
import type {
  AddTransactionPayload,
  AllocateSurplusPayload,
  ChangeTransactionCategoryPayload,
  CreateCommitmentPayload,
  RoeyActionPayload,
  RoeyActionPreview,
  RoeyActionType,
} from "./roey-action.types";
import { RoeyContextService } from "./roey-context.service";

@Injectable()
export class RoeyActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RoeyContextService,
    private readonly transactions: TransactionsService,
    private readonly budget: BudgetService,
    private readonly goals: GoalsService,
  ) {}

  async propose(userId: string, dto: CreateRoeyActionProposalDto) {
    if (dto.conversationId) {
      const conversation = await this.prisma.roeyConversation.findFirst({
        where: { id: dto.conversationId, userId },
        select: { id: true },
      });
      if (!conversation) throw new NotFoundException("השיחה לא נמצאה");
    }

    const { payload, preview } = await this.buildPreview(
      userId,
      dto.type,
      dto.payload,
    );
    const row = await this.prisma.roeyActionProposal.create({
      data: {
        userId,
        conversationId: dto.conversationId || null,
        type: dto.type,
        payloadJson: JSON.stringify(payload),
        previewJson: JSON.stringify(preview),
        severity: preview.severity,
        requiresDoubleConfirm: preview.requiresDoubleConfirm,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    await this.audit(userId, "ROEY_ACTION_PROPOSED", {
      proposalId: row.id,
      type: row.type,
      severity: row.severity,
    });
    return this.present(row);
  }

  async list(userId: string) {
    await this.expireOld(userId);
    const rows = await this.prisma.roeyActionProposal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return rows.map((row) => this.present(row));
  }

  async approve(
    userId: string,
    proposalId: string,
    dto: ApproveRoeyActionDto,
  ) {
    const proposal = await this.requireProposal(userId, proposalId);
    if (proposal.status === "EXECUTED") {
      return this.present(proposal);
    }
    if (proposal.status !== "PENDING" && proposal.status !== "APPROVED") {
      throw new ConflictException("ההצעה כבר טופלה");
    }
    if (proposal.expiresAt <= new Date()) {
      await this.prisma.roeyActionProposal.update({
        where: { id: proposal.id },
        data: { status: "EXPIRED" },
      });
      throw new ConflictException("תוקף ההצעה פג. יש להכין אותה מחדש");
    }

    const storedPayload = parseObject(proposal.payloadJson);
    const { payload, preview } = await this.buildPreview(
      userId,
      proposal.type as RoeyActionType,
      storedPayload,
    );
    if (
      preview.requiresDoubleConfirm &&
      dto.confirmationPhrase?.trim() !== "אני מאשר את ההשפעה"
    ) {
      throw new BadRequestException(
        "פעולה זו דורשת את המשפט: אני מאשר את ההשפעה",
      );
    }

    if (proposal.status === "PENDING") {
      const claimed = await this.prisma.roeyActionProposal.updateMany({
        where: { id: proposal.id, userId, status: "PENDING" },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          previewJson: JSON.stringify(preview),
          severity: preview.severity,
          requiresDoubleConfirm: preview.requiresDoubleConfirm,
        },
      });
      if (claimed.count !== 1) {
        const latest = await this.requireProposal(userId, proposalId);
        if (latest.status === "EXECUTED") return this.present(latest);
        throw new ConflictException("ההצעה כבר טופלה");
      }
    }

    try {
      await this.execute(
        userId,
        proposal.type as RoeyActionType,
        payload,
        proposal.id,
      );
      return this.present(await this.requireProposal(userId, proposal.id));
    } catch (error) {
      const incidentId = randomUUID();
      console.error("Roey action failed", {
        incidentId,
        proposalId: proposal.id,
        type: proposal.type,
        error,
      });
      const failed = await this.prisma.roeyActionProposal.updateMany({
        where: { id: proposal.id, userId, status: "APPROVED" },
        data: {
          status: "FAILED",
          errorHe: `ביצוע הפעולה נכשל. מזהה תקלה: ${incidentId}`,
        },
      });
      if (failed.count === 0) {
        const latest = await this.requireProposal(userId, proposal.id);
        if (latest.status === "EXECUTED") return this.present(latest);
      }
      await this.audit(userId, "ROEY_ACTION_FAILED", {
        proposalId: proposal.id,
        type: proposal.type,
        incidentId,
      });
      throw new ConflictException(
        `ביצוע הפעולה נכשל. מזהה תקלה: ${incidentId}`,
      );
    }
  }

  async reject(
    userId: string,
    proposalId: string,
    dto: RejectRoeyActionDto,
  ) {
    const updated = await this.prisma.roeyActionProposal.updateMany({
      where: { id: proposalId, userId, status: "PENDING" },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        errorHe: dto.reason?.trim().slice(0, 300) || null,
      },
    });
    if (updated.count !== 1) {
      await this.requireProposal(userId, proposalId);
      throw new ConflictException("ההצעה כבר טופלה");
    }
    await this.audit(userId, "ROEY_ACTION_REJECTED", { proposalId });
    return this.present(await this.requireProposal(userId, proposalId));
  }

  private async buildPreview(
    userId: string,
    type: RoeyActionType,
    raw: Record<string, unknown>,
  ): Promise<{ payload: RoeyActionPayload; preview: RoeyActionPreview }> {
    if (type === "CHANGE_TRANSACTION_CATEGORY") {
      const payload: ChangeTransactionCategoryPayload = {
        transactionId: requiredString(raw.transactionId, "תנועה"),
        categoryKey: requiredString(raw.categoryKey, "קטגוריה"),
      };
      const transaction = await this.prisma.transaction.findFirst({
        where: { id: payload.transactionId, userId },
        select: {
          id: true,
          description: true,
          categoryKey: true,
          amount: true,
          direction: true,
        },
      });
      if (!transaction) throw new NotFoundException("התנועה לא נמצאה");
      if (transaction.direction === "TRANSFER") {
        throw new BadRequestException(
          "Roey אינו משנה קטגוריה של העברה בנקאית",
        );
      }
      await this.assertCategory(
        userId,
        payload.categoryKey,
        transaction.direction,
      );
      return {
        payload,
        preview: {
          titleHe: "שינוי קטגוריה",
          summaryHe: `${transaction.description || "תנועה"}: ${transaction.categoryKey} ← ${payload.categoryKey}`,
          effectHe: "הסכום והיתרה לא ישתנו. הדוחות יסווגו את התנועה מחדש.",
          alternativeHe: null,
          amountIls: Number(transaction.amount),
          availableBefore: null,
          availableAfter: null,
          severity: "INFO",
          requiresDoubleConfirm: false,
        },
      };
    }

    const built = await this.context.build(userId);
    const availableBefore = built.forecast.startingAvailable;

    if (type === "ADD_TRANSACTION") {
      const direction = requiredChoice(
        raw.direction,
        ["INCOME", "EXPENSE"] as const,
        "כיוון התנועה",
      );
      const amount = requiredAmount(raw.amount);
      const bookedAt = requiredDate(raw.bookedAt);
      const categoryKey = requiredString(raw.categoryKey, "קטגוריה");
      await this.assertCategory(userId, categoryKey, direction);
      const payload: AddTransactionPayload = {
        direction,
        amount,
        categoryKey,
        bookedAt,
        ...(optionalString(raw.description)
          ? { description: optionalString(raw.description) }
          : {}),
      };
      const availableAfter =
        availableBefore + (direction === "INCOME" ? amount : -amount);
      const policy = classifyActionImpact(availableBefore, availableAfter);
      return {
        payload,
        preview: {
          titleHe:
            direction === "INCOME" ? "הוספת הכנסה" : "הוספת הוצאה",
          summaryHe: `${direction === "INCOME" ? "הכנסה" : "הוצאה"} בסך ${formatIls(amount)}`,
          effectHe: `הזמין בפועל יעבור מ־${formatIls(availableBefore)} ל־${formatIls(availableAfter)}.`,
          amountIls: amount,
          availableBefore,
          availableAfter,
          ...policy,
        },
      };
    }

    if (type === "CREATE_COMMITMENT") {
      const expectedAmount = requiredAmount(raw.expectedAmount);
      const cadence = requiredChoice(
        raw.cadence ?? "MONTHLY",
        ["MONTHLY", "YEARLY"] as const,
        "תדירות",
      );
      const anchorDay =
        raw.anchorDay == null ? undefined : integerInRange(raw.anchorDay, 1, 31);
      const categoryKey = requiredString(raw.categoryKey, "קטגוריה");
      await this.assertCategory(userId, categoryKey, "EXPENSE");
      const payload: CreateCommitmentPayload = {
        titleHe: requiredString(raw.titleHe, "שם ההתחייבות"),
        categoryKey,
        expectedAmount,
        cadence,
        ...(anchorDay ? { anchorDay } : {}),
      };
      const monthlyImpact =
        cadence === "YEARLY" ? expectedAmount / 12 : expectedAmount;
      const availableAfter = availableBefore - monthlyImpact;
      const policy = classifyActionImpact(availableBefore, availableAfter);
      return {
        payload,
        preview: {
          titleHe: "יצירת התחייבות",
          summaryHe: `${payload.titleHe}: ${formatIls(expectedAmount)} ${cadence === "YEARLY" ? "בשנה" : "בחודש"}`,
          effectHe: `ההשפעה החודשית המשוערת היא ${formatIls(monthlyImpact)}.`,
          amountIls: expectedAmount,
          availableBefore,
          availableAfter,
          ...policy,
        },
      };
    }

    const payload: AllocateSurplusPayload = {
      goalId: requiredString(raw.goalId, "יעד"),
      amount: requiredAmount(raw.amount),
      month: requiredMonth(raw.month),
    };
    const [goal, snapshot] = await Promise.all([
      this.prisma.goal.findFirst({
        where: { id: payload.goalId, userId },
        select: {
          id: true,
          title: true,
          targetAmount: true,
          currentAmount: true,
        },
      }),
      this.budget.snapshot(userId, payload.month),
    ]);
    if (!goal) throw new NotFoundException("היעד לא נמצא");
    const goalRemaining = Math.max(
      0,
      Number(goal.targetAmount) - Number(goal.currentAmount),
    );
    if (payload.amount > goalRemaining + 0.01) {
      throw new BadRequestException(
        `ניתן להקצות עד ${formatIls(goalRemaining)} להשלמת היעד`,
      );
    }
    if (payload.amount > snapshot.leftover + 0.01) {
      throw new BadRequestException(
        `ניתן להקצות עד ${formatIls(Math.max(0, snapshot.leftover))} מהנותר`,
      );
    }
    const availableAfter = availableBefore - payload.amount;
    const policy = classifyActionImpact(availableBefore, availableAfter);
    return {
      payload,
      preview: {
        titleHe: "הקצאת עודף ליעד",
        summaryHe: `${formatIls(payload.amount)} ליעד «${goal.title}»`,
        effectHe: `הזמין בפועל יעבור מ־${formatIls(availableBefore)} ל־${formatIls(availableAfter)}.`,
        amountIls: payload.amount,
        availableBefore,
        availableAfter,
        ...policy,
      },
    };
  }

  private async execute(
    userId: string,
    type: RoeyActionType,
    payload: RoeyActionPayload,
    proposalId: string,
  ) {
    if (type === "ADD_TRANSACTION") {
      const value = payload as AddTransactionPayload;
      return this.transactions.create(
        userId,
        {
          direction: value.direction,
          amount: value.amount,
          categoryKey: value.categoryKey,
          bookedAt: value.bookedAt,
          description: value.description,
        },
        {
          sourceType: SourceType.CHAT,
          auditAction: "ROEY_TRANSACTION_CREATED",
          proposalId,
        },
      );
    }
    if (type === "CREATE_COMMITMENT") {
      const value = payload as CreateCommitmentPayload;
      return this.budget.createCommitment(
        userId,
        {
          titleHe: value.titleHe,
          categoryKey: value.categoryKey,
          expectedAmount: value.expectedAmount,
          cadence: value.cadence,
          anchorDay: value.anchorDay,
        },
        {
          sourceType: SourceType.CHAT,
          auditAction: "ROEY_COMMITMENT_CREATED",
          proposalId,
        },
      );
    }
    if (type === "CHANGE_TRANSACTION_CATEGORY") {
      const value = payload as ChangeTransactionCategoryPayload;
      return this.transactions.update(
        userId,
        value.transactionId,
        { categoryKey: value.categoryKey },
        {
          sourceType: SourceType.CHAT,
          auditAction: "ROEY_TRANSACTION_CATEGORY_CHANGED",
          proposalId,
        },
      );
    }
    const value = payload as AllocateSurplusPayload;
    return this.goals.applySurplus(
      userId,
      value.goalId,
      { amount: value.amount, month: value.month, confirm: true },
      {
        sourceType: SourceType.CHAT,
        auditAction: "ROEY_GOAL_SURPLUS_APPLIED",
        proposalId,
      },
    );
  }

  private async assertCategory(
    userId: string,
    categoryKey: string,
    direction: "INCOME" | "EXPENSE",
  ) {
    const builtIn =
      direction === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (builtIn.some((category) => category.key === categoryKey)) return;
    const custom = await this.prisma.userCategory.findFirst({
      where: { userId, key: categoryKey, direction },
      select: { id: true },
    });
    if (!custom) {
      throw new BadRequestException(
        "הקטגוריה אינה קיימת או אינה מתאימה לכיוון התנועה",
      );
    }
  }

  private requireProposal(userId: string, id: string) {
    return this.prisma.roeyActionProposal
      .findFirst({ where: { id, userId } })
      .then((row) => {
        if (!row) throw new NotFoundException("ההצעה לא נמצאה");
        return row;
      });
  }

  private async expireOld(userId: string) {
    await this.prisma.roeyActionProposal.updateMany({
      where: { userId, status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
  }

  private present(row: {
    id: string;
    conversationId: string | null;
    type: string;
    status: string;
    payloadJson: string;
    previewJson: string;
    severity: string;
    requiresDoubleConfirm: boolean;
    expiresAt: Date;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    executedAt: Date | null;
    resultJson: string | null;
    errorHe: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      conversationId: row.conversationId,
      type: row.type,
      status: row.status,
      payload: parseObject(row.payloadJson),
      preview: parseObject(row.previewJson),
      severity: row.severity,
      requiresDoubleConfirm: row.requiresDoubleConfirm,
      expiresAt: row.expiresAt,
      approvedAt: row.approvedAt,
      rejectedAt: row.rejectedAt,
      executedAt: row.executedAt,
      result: row.resultJson ? parseUnknown(row.resultJson) : null,
      errorHe: row.errorHe,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private audit(
    userId: string,
    action: string,
    meta?: Record<string, unknown>,
  ) {
    return this.prisma.auditEvent.create({
      data: {
        userId,
        action,
        meta: meta ? JSON.stringify(meta) : null,
      },
    });
  }
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(`${label} חסר`);
  }
  return value.trim().slice(0, 240);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 500)
    : undefined;
}

function requiredAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    throw new BadRequestException("סכום לא תקין");
  }
  return Math.round(amount * 100) / 100;
}

function requiredChoice<const T extends readonly string[]>(
  value: unknown,
  values: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new BadRequestException(`${label} אינו תקין`);
  }
  return value as T[number];
}

function requiredDate(value: unknown) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException("תאריך התנועה אינו תקין");
  }
  return new Date(value).toISOString();
}

function requiredMonth(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) {
    throw new BadRequestException("חודש אינו תקין");
  }
  return value;
}

function integerInRange(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new BadRequestException("יום החיוב אינו תקין");
  }
  return number;
}

function parseObject(value: string): Record<string, unknown>;
function parseObject(value: Record<string, unknown>): Record<string, unknown>;
function parseObject(value: string | Record<string, unknown>) {
  if (typeof value !== "string") return value;
  const parsed = parseUnknown(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BadRequestException("נתוני הפעולה אינם תקינים");
  }
  return parsed as Record<string, unknown>;
}

function parseUnknown(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new BadRequestException("נתוני הפעולה אינם תקינים");
  }
}

function formatIls(value: number) {
  return `₪${Math.round(value).toLocaleString("he-IL")}`;
}
