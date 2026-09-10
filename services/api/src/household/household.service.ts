import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CreateHouseholdInviteDto } from "./household.dto";

@Injectable()
export class HouseholdService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string) {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        email: true,
        householdOwnerId: true,
      },
    });
    if (!me) throw new NotFoundException();

    if (me.householdOwnerId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: me.householdOwnerId },
        select: { id: true, displayName: true, email: true },
      });
      return {
        linked: true as const,
        role: "partner" as const,
        owner: owner
          ? {
              id: owner.id,
              displayName: owner.displayName || owner.email,
            }
          : null,
        partnerLabelHe: null as string | null,
      };
    }

    const members = await this.prisma.user.findMany({
      where: { householdOwnerId: userId },
      select: { id: true, displayName: true, email: true },
    });
    const invite = await this.prisma.householdInvite.findFirst({
      where: {
        ownerId: userId,
        claimedBy: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      linked: members.length > 0 || Boolean(invite),
      role: "owner" as const,
      partners: members.map((m) => ({
        id: m.id,
        displayName: m.displayName || m.email,
      })),
      activeInvite: invite
        ? { code: invite.code, labelHe: invite.labelHe, expiresAt: invite.expiresAt }
        : null,
    };
  }

  async createInvite(userId: string, dto: CreateHouseholdInviteDto) {
    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!me) throw new NotFoundException();
    if (me.householdOwnerId) {
      throw new BadRequestException(
        "שותף מחובר לחשבון אחר — אין ליצור הזמנה מכאן",
      );
    }

    await this.prisma.householdInvite.updateMany({
      where: { ownerId: userId, claimedBy: null },
      data: { expiresAt: new Date() },
    });

    const code = randomBytes(3).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await this.prisma.householdInvite.create({
      data: {
        ownerId: userId,
        code,
        labelHe: dto.labelHe?.trim() || "בן/בת זוג",
        expiresAt,
      },
    });
    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: "HOUSEHOLD_INVITE_CREATED",
        meta: JSON.stringify({ code: invite.code }),
      },
    });
    return {
      code: invite.code,
      labelHe: invite.labelHe,
      expiresAt: invite.expiresAt,
    };
  }

  async redeem(userId: string, codeRaw: string) {
    const code = codeRaw.trim().toUpperCase();
    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!me) throw new NotFoundException();
    if (me.householdOwnerId) {
      throw new BadRequestException("כבר מחוברים למשק בית משותף");
    }
    const memberCount = await this.prisma.user.count({
      where: { householdOwnerId: userId },
    });
    if (memberCount > 0) {
      throw new BadRequestException(
        "יש לכם כבר שותפים — לא ניתן להצטרף למשק בית אחר",
      );
    }

    const invite = await this.prisma.householdInvite.findUnique({
      where: { code },
    });
    if (!invite || (invite.expiresAt && invite.expiresAt < new Date())) {
      throw new BadRequestException("קוד ההזמנה אינו תקף או שפג תוקפו");
    }
    if (invite.ownerId === userId) {
      throw new BadRequestException("לא ניתן להשתמש בקוד של עצמכם");
    }
    if (invite.claimedBy) {
      throw new BadRequestException("קוד ההזמנה כבר נוצל");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { householdOwnerId: invite.ownerId },
      }),
      this.prisma.householdInvite.update({
        where: { id: invite.id },
        data: { claimedBy: userId, claimedAt: new Date() },
      }),
      this.prisma.auditEvent.create({
        data: {
          userId,
          action: "HOUSEHOLD_LINKED",
          meta: JSON.stringify({ ownerId: invite.ownerId }),
        },
      }),
    ]);

    return this.status(userId);
  }

  async unlink(userId: string) {
    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!me) throw new NotFoundException();

    if (me.householdOwnerId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { householdOwnerId: null },
      });
      await this.prisma.auditEvent.create({
        data: {
          userId,
          action: "HOUSEHOLD_UNLINKED",
          meta: JSON.stringify({ as: "partner" }),
        },
      });
      return { ok: true as const };
    }

    await this.prisma.user.updateMany({
      where: { householdOwnerId: userId },
      data: { householdOwnerId: null },
    });
    await this.prisma.householdInvite.updateMany({
      where: { ownerId: userId, claimedBy: null },
      data: { expiresAt: new Date() },
    });
    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: "HOUSEHOLD_UNLINKED",
        meta: JSON.stringify({ as: "owner" }),
      },
    });
    return { ok: true as const };
  }
}
