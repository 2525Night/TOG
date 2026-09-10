import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
  OnModuleInit,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from "./auth.dto";
import { CompleteOnboardingDto } from "./onboarding.dto";
import { Prisma } from "@prisma/client";

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const email = (
      this.config.get<string>("ADMIN_BOOTSTRAP_EMAIL") || ""
    ).toLowerCase();
    const password = this.config.get<string>("ADMIN_BOOTSTRAP_PASSWORD");
    if (!email || !password) return;

    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      await this.prisma.user.update({
        where: { email },
        data: {
          passwordHash,
          role: "ADMIN",
          displayName: existing.displayName || "Admin",
          onboardingCompleted: true,
        },
      });
      return;
    }

    await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: "Admin",
        role: "ADMIN",
        onboardingCompleted: true,
      },
    });
  }

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (exists) {
      throw new ConflictException("האימייל כבר רשום");
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        displayName: dto.displayName || null,
        role: "USER",
        onboardingCompleted: false,
      },
    });
    await this.prisma.auditEvent.create({
      data: { userId: user.id, action: "USER_REGISTERED" },
    });
    return this.tokenResponse(
      user.id,
      user.email,
      user.role,
      user.onboardingCompleted,
    );
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException("אימייל או סיסמה שגויים");
    }
    const password = dto.password;
    const normalizedPassword = password
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
      .trim();
    const candidates = [...new Set([password, normalizedPassword])].filter(
      Boolean,
    );
    const ok = (
      await Promise.all(
        candidates.map((candidate) =>
          bcrypt.compare(candidate, user.passwordHash),
        ),
      )
    ).some(Boolean);
    if (!ok) {
      throw new UnauthorizedException("אימייל או סיסמה שגויים");
    }
    await this.prisma.auditEvent.create({
      data: { userId: user.id, action: "USER_LOGIN" },
    });
    return this.tokenResponse(
      user.id,
      user.email,
      user.role,
      user.onboardingCompleted,
    );
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        currency: true,
        jurisdiction: true,
        onboardingCompleted: true,
        createdAt: true,
        householdOwnerId: true,
      },
    });
    if (!user) throw new UnauthorizedException();

    let household: {
      linked: boolean;
      role: "owner" | "partner" | "solo";
      labelHe?: string;
    } = { linked: false, role: "solo" };

    if (user.householdOwnerId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: user.householdOwnerId },
        select: { displayName: true, email: true },
      });
      household = {
        linked: true,
        role: "partner",
        labelHe: owner?.displayName || owner?.email || "משק בית משותף",
      };
    } else {
      const partners = await this.prisma.user.count({
        where: { householdOwnerId: userId },
      });
      if (partners > 0) {
        household = {
          linked: true,
          role: "owner",
          labelHe: "שותפים במסע",
        };
      }
    }

    const { householdOwnerId: _omit, ...rest } = user;
    return { ...rest, household };
  }

  async completeOnboarding(userId: string, dto: CompleteOnboardingDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.onboardingCompleted) {
      return { ok: true, alreadyCompleted: true };
    }

    const incomeNet = dto.monthlyIncomeNet > 0 ? dto.monthlyIncomeNet : 0;
    const account = await this.prisma.financialAccount.create({
      data: {
        userId,
        name: dto.accountName,
        kind: "BANK",
        currentBalance: new Prisma.Decimal(incomeNet),
        sourceType: "USER_INPUT",
        userConfirmed: true,
      },
    });

    if (incomeNet > 0) {
      const bookedAt = new Date();
      bookedAt.setDate(1);
      await this.prisma.transaction.create({
        data: {
          userId,
          accountId: account.id,
          direction: "INCOME",
          amount: new Prisma.Decimal(incomeNet),
          categoryKey: "salary",
          description: "הכנסה חודשית נטו (הקמה)",
          bookedAt,
          sourceType: "USER_INPUT",
          userConfirmed: true,
        },
      });
    }

    // Optional credit cards — created before commitments so payVia can link.
    const cardIds: string[] = [];
    for (const card of dto.creditCards ?? []) {
      const name = card.name?.trim();
      if (!name) continue;
      const created = await this.prisma.creditCard.create({
        data: {
          userId,
          name,
          currentBalance: new Prisma.Decimal(card.currentBalance ?? 0),
          creditLimit: new Prisma.Decimal(card.creditLimit ?? 0),
          active: true,
        },
      });
      cardIds.push(created.id);
    }

    // Fixed expenses become budget commitments — not synthetic ledger txs.
    for (const exp of dto.fixedExpenses) {
      if (exp.amount <= 0) continue;
      const viaCard =
        exp.payVia === "CREDIT_CARD" &&
        exp.creditCardIndex != null &&
        exp.creditCardIndex >= 0 &&
        exp.creditCardIndex < cardIds.length;
      await this.prisma.budgetCommitment.create({
        data: {
          userId,
          titleHe: exp.label,
          categoryKey: exp.categoryKey,
          expectedAmount: new Prisma.Decimal(exp.amount),
          nature: "FIXED",
          cadence: "MONTHLY",
          payVia: viaCard ? "CREDIT_CARD" : "ACCOUNT",
          creditCardId: viaCard ? cardIds[exp.creditCardIndex!] : null,
          sourceType: "USER_INPUT",
          userConfirmed: true,
          active: true,
        },
      });
    }

    if (dto.goalTitle && dto.goalTargetAmount != null && dto.goalTargetAmount > 0) {
      await this.prisma.goal.create({
        data: {
          userId,
          title: dto.goalTitle,
          kind: "EMERGENCY",
          targetAmount: new Prisma.Decimal(dto.goalTargetAmount),
          currentAmount: new Prisma.Decimal(dto.goalCurrentAmount ?? 0),
          sourceType: "USER_INPUT",
          userConfirmed: true,
        },
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
    });

    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: "ONBOARDING_COMPLETED",
        meta: JSON.stringify({
          accountId: account.id,
          commitments: dto.fixedExpenses.filter((e) => e.amount > 0).length,
          creditCards: cardIds.length,
        }),
      },
    });

    return { ok: true, accountId: account.id };
  }

  /**
   * Starts a password reset. Always returns a neutral success payload
   * (no email enumeration). In local/dev we also return a one-time link
   * so the flow can be tested without a mailer.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const base = {
      ok: true as const,
      message:
        "אם קיים חשבון עם האימייל הזה — אפשר להמשיך לאיפוס הסיסמה עכשיו.",
    };
    if (!user) return base;

    const resetToken = this.jwt.sign(
      { sub: user.id, email: user.email, purpose: "password-reset" },
      { expiresIn: "1h" },
    );
    await this.prisma.auditEvent.create({
      data: { userId: user.id, action: "USER_PASSWORD_RESET_REQUESTED" },
    });

    const exposeLink =
      this.config.get<string>("AUTH_EXPOSE_RESET_LINK") === "1" ||
      process.env.NODE_ENV !== "production";

    if (!exposeLink) {
      return {
        ...base,
        message:
          "אם קיים חשבון עם האימייל הזה — בדקו את תיבת הדואר להמשך האיפוס.",
      };
    }

    return {
      ...base,
      resetToken,
      resetPath: `/reset-password?token=${encodeURIComponent(resetToken)}`,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    let payload: { sub?: string; purpose?: string };
    try {
      payload = this.jwt.verify(dto.token) as {
        sub?: string;
        purpose?: string;
      };
    } catch {
      throw new BadRequestException(
        "קישור האיפוס אינו תקף או שפג תוקפו — בקשו קישור חדש",
      );
    }
    if (payload.purpose !== "password-reset" || !payload.sub) {
      throw new BadRequestException("קישור איפוס לא תקין");
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const user = await this.prisma.user.update({
      where: { id: payload.sub },
      data: { passwordHash },
    });
    await this.prisma.auditEvent.create({
      data: { userId: user.id, action: "USER_PASSWORD_RESET_COMPLETED" },
    });
    return { ok: true, message: "הסיסמה עודכנה — אפשר להתחבר" };
  }

  private tokenResponse(
    userId: string,
    email: string,
    role: "USER" | "ADMIN",
    onboardingCompleted: boolean,
  ) {
    const accessToken = this.jwt.sign({
      sub: userId,
      email,
      role,
    });
    return {
      accessToken,
      user: { id: userId, email, role, onboardingCompleted },
    };
  }
}
