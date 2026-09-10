import { Injectable } from "@nestjs/common";
import { Prisma, SourceType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  ReviewFinancialPlanDto,
  UpsertFinancialPlanDto,
} from "./financial-plan.dto";

@Injectable()
export class FinancialPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const plan = await this.prisma.userFinancialPlan.findUnique({
      where: { userId },
      include: {
        milestones: { orderBy: { position: "asc" } },
        constraints: { orderBy: { createdAt: "asc" } },
        events: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    });
    if (plan) return this.present(plan);

    const profile = await this.prisma.roeyProfile.findUnique({
      where: { userId },
      select: { primaryGoal: true },
    });
    return {
      plan: null,
      suggested: {
        objectiveHe:
          profile?.primaryGoal || "לבנות יציבות ושליטה בתזרים החודשי",
        priority: "STABILITY",
        riskCapacity: "CONSERVATIVE",
      },
    };
  }

  async upsert(userId: string, dto: UpsertFinancialPlanDto) {
    const existing = await this.prisma.userFinancialPlan.findUnique({
      where: { userId },
      include: { milestones: true, constraints: true },
    });
    const version = (existing?.version ?? 0) + 1;
    const plan = await this.prisma.$transaction(
      async (db) => {
        const row = await db.userFinancialPlan.upsert({
          where: { userId },
          create: {
            userId,
            version,
            objectiveHe: dto.objectiveHe.trim(),
            motivationHe: clean(dto.motivationHe),
            priority: dto.priority || "STABILITY",
            horizonMonths: dto.horizonMonths ?? null,
            riskCapacity: dto.riskCapacity || "CONSERVATIVE",
            nextActionHe: clean(dto.nextActionHe),
            reviewAt: dto.reviewAt ? new Date(dto.reviewAt) : null,
            assumptionsJson: JSON.stringify([
              "התוכנית מבוססת על הנתונים הזמינים כעת ב-MoneyTail.",
            ]),
            reviewTriggersJson: JSON.stringify([
              "שינוי מהותי בהכנסה",
              "התחייבות חדשה",
              "זמין בפועל שלילי",
              "מידע חסר או לא מעודכן",
            ]),
          },
          update: {
            version,
            objectiveHe: dto.objectiveHe.trim(),
            motivationHe: clean(dto.motivationHe),
            priority: dto.priority || existing?.priority || "STABILITY",
            horizonMonths:
              dto.horizonMonths === undefined
                ? existing?.horizonMonths
                : dto.horizonMonths,
            riskCapacity:
              dto.riskCapacity ||
              existing?.riskCapacity ||
              "CONSERVATIVE",
            nextActionHe:
              dto.nextActionHe === undefined
                ? existing?.nextActionHe
                : clean(dto.nextActionHe),
            reviewAt:
              dto.reviewAt === undefined
                ? existing?.reviewAt
                : new Date(dto.reviewAt),
          },
        });

        if (dto.milestones) {
          await db.financialPlanMilestone.deleteMany({
            where: { planId: row.id },
          });
          if (dto.milestones.length > 0) {
            await db.financialPlanMilestone.createMany({
              data: dto.milestones.map((milestone, position) => ({
                planId: row.id,
                titleHe: milestone.titleHe.trim(),
                targetAmount:
                  milestone.targetAmount == null
                    ? null
                    : new Prisma.Decimal(milestone.targetAmount),
                targetDate: milestone.targetDate
                  ? new Date(milestone.targetDate)
                  : null,
                position,
              })),
            });
          }
        }

        if (dto.constraints) {
          await db.financialPlanConstraint.deleteMany({
            where: { planId: row.id },
          });
          if (dto.constraints.length > 0) {
            await db.financialPlanConstraint.createMany({
              data: dto.constraints.map((constraint) => ({
                planId: row.id,
                type: constraint.type,
                labelHe: constraint.labelHe.trim(),
                valueJson:
                  constraint.value === undefined
                    ? null
                    : JSON.stringify(constraint.value),
                hard: constraint.hard ?? true,
              })),
            });
          }
        }

        await db.financialPlanEvent.create({
          data: {
            planId: row.id,
            version,
            type: existing ? "PLAN_UPDATED" : "PLAN_CREATED",
            summaryHe: existing
              ? "התוכנית הפיננסית עודכנה באישור המשתמש."
              : "נוצרה תוכנית פיננסית ראשונה.",
            reasonHe: dto.motivationHe?.trim() || null,
            changesJson: JSON.stringify({
              objectiveHe: dto.objectiveHe.trim(),
              priority: dto.priority || row.priority,
              milestoneCount:
                dto.milestones?.length ?? existing?.milestones.length ?? 0,
              constraintCount:
                dto.constraints?.length ?? existing?.constraints.length ?? 0,
            }),
            source: SourceType.USER_INPUT,
          },
        });
        await db.auditEvent.create({
          data: {
            userId,
            action: existing
              ? "ROEY_FINANCIAL_PLAN_UPDATED"
              : "ROEY_FINANCIAL_PLAN_CREATED",
            meta: JSON.stringify({ planId: row.id, version }),
          },
        });
        return row;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.get(userId).then((result) => ({
      ...result,
      planId: plan.id,
    }));
  }

  async review(userId: string, dto: ReviewFinancialPlanDto) {
    const existing = await this.prisma.userFinancialPlan.findUnique({
      where: { userId },
    });
    if (!existing) return this.get(userId);
    const now = new Date();
    const version = existing.version + 1;
    await this.prisma.$transaction([
      this.prisma.userFinancialPlan.update({
        where: { id: existing.id },
        data: {
          version,
          lastReviewedAt: now,
          reviewAt: dto.nextReviewAt
            ? new Date(dto.nextReviewAt)
            : existing.reviewAt,
        },
      }),
      this.prisma.financialPlanEvent.create({
        data: {
          planId: existing.id,
          version,
          type: "PLAN_REVIEWED",
          summaryHe: dto.summaryHe.trim(),
          source: SourceType.USER_INPUT,
        },
      }),
      this.prisma.auditEvent.create({
        data: {
          userId,
          action: "ROEY_FINANCIAL_PLAN_REVIEWED",
          meta: JSON.stringify({ planId: existing.id, version }),
        },
      }),
    ]);
    return this.get(userId);
  }

  async context(userId: string) {
    const result = await this.get(userId);
    if (!("plan" in result) || !result.plan) return null;
    const { events: _events, ...plan } = result.plan;
    return plan;
  }

  private present(plan: Awaited<ReturnType<FinancialPlanService["loadPlan"]>>) {
    return {
      plan: {
        ...plan,
        milestones: plan.milestones.map((milestone) => ({
          ...milestone,
          targetAmount:
            milestone.targetAmount == null
              ? null
              : Number(milestone.targetAmount),
        })),
        constraints: plan.constraints.map((constraint) => ({
          ...constraint,
          value: parseJson(constraint.valueJson),
          valueJson: undefined,
        })),
        assumptions: parseJson(plan.assumptionsJson) ?? [],
        reviewTriggers: parseJson(plan.reviewTriggersJson) ?? [],
        assumptionsJson: undefined,
        reviewTriggersJson: undefined,
      },
      suggested: null,
    };
  }

  private loadPlan(userId: string) {
    return this.prisma.userFinancialPlan.findUniqueOrThrow({
      where: { userId },
      include: {
        milestones: { orderBy: { position: "asc" } },
        constraints: { orderBy: { createdAt: "asc" } },
        events: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    });
  }
}

function clean(value: string | undefined) {
  return value?.trim() || null;
}

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
