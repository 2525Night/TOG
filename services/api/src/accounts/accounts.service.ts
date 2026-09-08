import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MonthFactsService } from "../month-facts/month-facts.service";
import { CreateAccountDto, UpdateAccountDto } from "./accounts.dto";

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monthFacts: MonthFactsService,
  ) {}

  list(userId: string) {
    return this.prisma.financialAccount.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(userId: string, dto: CreateAccountDto) {
    if (dto.kind !== "BANK") {
      throw new BadRequestException("כרגע נתמך רק חשבון בנק אחד");
    }
    const existingBank = await this.prisma.financialAccount.findFirst({
      where: { userId, isActive: true, kind: "BANK" },
    });
    if (existingBank) {
      throw new BadRequestException(
        "כרגע ניתן לנהל חשבון בנק אחד בלבד",
      );
    }
    const account = await this.prisma.financialAccount.create({
      data: {
        userId,
        name: dto.name,
        kind: "BANK",
        currentBalance: new Prisma.Decimal(0),
        sourceType: "USER_INPUT",
        userConfirmed: true,
      },
    });
    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: "ACCOUNT_CREATED",
        meta: JSON.stringify({ accountId: account.id }),
      },
    });
    return account;
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    await this.ensureOwned(userId, id);
    if (dto.kind === "CREDIT_CARD" || dto.kind === "LOAN") {
      throw new BadRequestException(
        "כרטיס אשראי והלוואה מנוהלים במסך אשראי והלוואות — לא כחשבון עו״ש",
      );
    }
    const account = await this.prisma.financialAccount.update({
      where: { id },
      data: {
        name: dto.name,
        kind: dto.kind,
        isActive: dto.isActive,
        currentBalance:
          dto.currentBalance === undefined
            ? undefined
            : new Prisma.Decimal(dto.currentBalance),
      },
    });
    this.monthFacts.invalidateUser(userId);
    return account;
  }

  private async ensureOwned(userId: string, id: string) {
    const row = await this.prisma.financialAccount.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException("חשבון לא נמצא");
    return row;
  }
}
