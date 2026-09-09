import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { UpsertRoeyMemoryDto } from "./roey-memory.dto";

@Injectable()
export class RoeyMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async context(userId: string, conversationId: string | null) {
    const profile = await this.prisma.roeyProfile.findUnique({
      where: { userId },
      select: { memoryEnabled: true },
    });
    if (!profile?.memoryEnabled) {
      return { enabled: false, episodic: null, semantic: [] };
    }
    const [conversation, semantic] = await Promise.all([
      conversationId
        ? this.prisma.roeyConversation.findFirst({
            where: { id: conversationId, userId },
            select: { summaryHe: true, summaryUpdatedAt: true },
          })
        : null,
      this.prisma.roeySemanticMemory.findMany({
        where: {
          userId,
          status: "ACTIVE",
          userConfirmed: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
    ]);
    return {
      enabled: true,
      episodic: conversation?.summaryHe
        ? {
            summaryHe: conversation.summaryHe,
            updatedAt: conversation.summaryUpdatedAt,
          }
        : null,
      semantic: semantic.map((item) => ({
        id: item.id,
        key: item.key,
        value: parseJson(item.valueJson),
        confidence: item.confidence,
        userConfirmed: item.userConfirmed,
        updatedAt: item.updatedAt,
      })),
    };
  }

  async list(userId: string) {
    const rows = await this.prisma.roeySemanticMemory.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      value: parseJson(row.valueJson),
      confidence: row.confidence,
      userConfirmed: row.userConfirmed,
      sourceConversationId: row.sourceConversationId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async upsert(
    userId: string,
    dto: UpsertRoeyMemoryDto,
    source?: { conversationId?: string; messageId?: string },
  ) {
    await this.assertEnabled(userId);
    const key = normalizeKey(dto.key);
    const row = await this.prisma.roeySemanticMemory.upsert({
      where: { userId_key: { userId, key } },
      create: {
        userId,
        key,
        valueJson: JSON.stringify({ textHe: dto.valueHe.trim() }),
        sourceConversationId: source?.conversationId || null,
        sourceMessageId: source?.messageId || null,
        confidence: dto.userConfirmed === false ? 0.6 : 1,
        userConfirmed: dto.userConfirmed ?? true,
      },
      update: {
        valueJson: JSON.stringify({ textHe: dto.valueHe.trim() }),
        sourceConversationId: source?.conversationId || undefined,
        sourceMessageId: source?.messageId || undefined,
        confidence: dto.userConfirmed === false ? 0.6 : 1,
        userConfirmed: dto.userConfirmed ?? true,
        status: "ACTIVE",
      },
    });
    await this.audit(userId, "ROEY_MEMORY_UPSERTED", {
      memoryId: row.id,
      key,
      userConfirmed: row.userConfirmed,
    });
    return {
      id: row.id,
      key: row.key,
      value: parseJson(row.valueJson),
      userConfirmed: row.userConfirmed,
    };
  }

  async rememberExplicitStatement(
    userId: string,
    conversationId: string | null,
    message: string,
  ) {
    const match = message.match(/(?:תזכור|זכור|חשוב לי שתזכור)\s+(?:ש)?(.+)/i);
    const valueHe = match?.[1]?.trim();
    if (!valueHe) return null;
    return this.upsert(
      userId,
      {
        key: `explicit-${createHash("sha256")
          .update(valueHe)
          .digest("hex")
          .slice(0, 12)}`,
        valueHe,
        userConfirmed: true,
      },
      { conversationId: conversationId || undefined },
    );
  }

  async forget(userId: string, id: string) {
    const row = await this.prisma.roeySemanticMemory.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException("פריט הזיכרון לא נמצא");
    await this.prisma.roeySemanticMemory.update({
      where: { id },
      data: { status: "DELETED" },
    });
    await this.audit(userId, "ROEY_MEMORY_DELETED", { memoryId: id });
    return { ok: true };
  }

  async summarizeConversation(userId: string, conversationId: string) {
    const profile = await this.prisma.roeyProfile.findUnique({
      where: { userId },
      select: { memoryEnabled: true },
    });
    if (!profile?.memoryEnabled) return;
    const messages = await this.prisma.roeyMessage.findMany({
      where: { userId, conversationId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { role: true, contentHe: true },
    });
    const userTopics = messages
      .reverse()
      .filter((message) => message.role === "USER")
      .map((message) => message.contentHe.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(-5);
    if (userTopics.length === 0) return;
    const summaryHe = `המשתמש עסק בנושאים: ${userTopics.join(" | ")}`.slice(
      0,
      1_500,
    );
    await this.prisma.roeyConversation.updateMany({
      where: { id: conversationId, userId },
      data: { summaryHe, summaryUpdatedAt: new Date() },
    });
  }

  async purge(userId: string) {
    await this.prisma.$transaction([
      this.prisma.roeyConversation.deleteMany({ where: { userId } }),
      this.prisma.roeySemanticMemory.deleteMany({ where: { userId } }),
      this.prisma.auditEvent.create({
        data: { userId, action: "ROEY_OPTIONAL_MEMORY_PURGED" },
      }),
    ]);
  }

  private async assertEnabled(userId: string) {
    const profile = await this.prisma.roeyProfile.findUnique({
      where: { userId },
      select: { memoryEnabled: true },
    });
    if (!profile?.memoryEnabled) {
      throw new BadRequestException(
        "הזיכרון של Roey כבוי. יש להפעיל אותו לפני שמירה.",
      );
    }
  }

  private audit(
    userId: string,
    action: string,
    meta: Record<string, unknown>,
  ) {
    return this.prisma.auditEvent.create({
      data: { userId, action, meta: JSON.stringify(meta) },
    });
  }
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .slice(0, 100);
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
