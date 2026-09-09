import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  ConnectGoogleAiStudioDto,
  RoeyChatDto,
  SelectRoeyModelDto,
  UpdateRoeyProfileDto,
} from "./roey.dto";
import {
  GoogleAiStudioProvider,
  type GoogleModelOption,
} from "./google-ai-studio.provider";
import { RoeyContextService, DEFAULT_ROEY_PROFILE } from "./roey-context.service";
import { RoeyCryptoService } from "./roey-crypto.service";
import { RoeyJourneyService } from "./roey-journey.service";
import type { RoeyChatResponse } from "./roey.types";

@Injectable()
export class RoeyService {
  private readonly rateWindows = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: RoeyCryptoService,
    private readonly google: GoogleAiStudioProvider,
    private readonly contextService: RoeyContextService,
    private readonly journeyService: RoeyJourneyService,
  ) {}

  async connection(userId: string) {
    const row = await this.prisma.roeyAiConnection.findUnique({
      where: { userId },
    });
    if (!row) return { connected: false as const };
    return {
      connected: true as const,
      provider: row.provider,
      keyHint: row.keyHint,
      modelId: row.modelId,
      status: row.status,
      lastValidatedAt: row.lastValidatedAt,
    };
  }

  async connect(
    userId: string,
    dto: ConnectGoogleAiStudioDto,
  ) {
    this.rateLimit(userId, "connection", 5, 5 * 60_000);
    const apiKey = dto.apiKey.trim();
    const models = await this.google.listModels(apiKey);
    const preferred = this.google.preferredModel(models);
    const now = new Date();
    const encryptedCredential = this.crypto.encrypt(apiKey);
    const row = await this.prisma.roeyAiConnection.upsert({
      where: { userId },
      create: {
        userId,
        encryptedCredential,
        credentialKeyVersion: this.crypto.currentVersion,
        keyHint: this.crypto.keyHint(apiKey),
        modelId: preferred.id,
        status: "CONNECTED",
        consentVersion: "2026-09-09",
        consentedAt: now,
        lastValidatedAt: now,
      },
      update: {
        encryptedCredential,
        credentialKeyVersion: this.crypto.currentVersion,
        keyHint: this.crypto.keyHint(apiKey),
        modelId: preferred.id,
        status: "CONNECTED",
        consentVersion: "2026-09-09",
        consentedAt: now,
        lastValidatedAt: now,
      },
    });
    await this.audit(userId, "ROEY_GOOGLE_CONNECTED", {
      modelId: preferred.id,
      consentVersion: "2026-09-09",
    });
    return {
      connected: true,
      provider: row.provider,
      keyHint: row.keyHint,
      modelId: row.modelId,
      status: row.status,
      lastValidatedAt: row.lastValidatedAt,
      models,
    };
  }

  async testConnection(userId: string, dto: ConnectGoogleAiStudioDto) {
    this.rateLimit(userId, "connection", 5, 5 * 60_000);
    const models = await this.google.listModels(dto.apiKey.trim());
    return {
      ok: true,
      models,
      recommendedModelId: this.google.preferredModel(models).id,
    };
  }

  async models(userId: string) {
    this.rateLimit(userId, "models", 10, 60_000);
    const connection = await this.requireConnection(userId);
    const models = await this.google.listModels(
      this.crypto.decrypt(connection.encryptedCredential),
    );
    await this.prisma.roeyAiConnection.update({
      where: { userId },
      data: { lastValidatedAt: new Date(), status: "CONNECTED" },
    });
    return { models, selectedModelId: connection.modelId };
  }

  async selectModel(userId: string, dto: SelectRoeyModelDto) {
    this.rateLimit(userId, "models", 10, 60_000);
    const connection = await this.requireConnection(userId);
    const models = await this.google.listModels(
      this.crypto.decrypt(connection.encryptedCredential),
    );
    const selected = models.find((model) => model.id === dto.modelId);
    if (!selected) {
      throw new BadRequestException(
        "המודל שנבחר אינו זמין עבור החיבור הזה",
      );
    }
    await this.prisma.roeyAiConnection.update({
      where: { userId },
      data: {
        modelId: selected.id,
        status: "CONNECTED",
        lastValidatedAt: new Date(),
      },
    });
    await this.audit(userId, "ROEY_MODEL_SELECTED", {
      modelId: selected.id,
    });
    return { ok: true, modelId: selected.id };
  }

  async disconnect(userId: string) {
    await this.prisma.roeyAiConnection.deleteMany({ where: { userId } });
    await this.audit(userId, "ROEY_GOOGLE_DISCONNECTED");
    return { ok: true };
  }

  async profile(userId: string) {
    const row = await this.prisma.roeyProfile.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_ROEY_PROFILE },
      update: {},
    });
    const journey = await this.journeyService.forUser(userId);
    return { ...row, journey };
  }

  async updateProfile(userId: string, dto: UpdateRoeyProfileDto) {
    const primaryGoal =
      dto.primaryGoal === undefined
        ? undefined
        : dto.primaryGoal.trim() || null;
    const row = await this.prisma.roeyProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...DEFAULT_ROEY_PROFILE,
        ...dto,
        primaryGoal,
      },
      update: { ...dto, primaryGoal },
    });
    await this.audit(userId, "ROEY_PROFILE_UPDATED", {
      fields: Object.keys(dto),
    });
    if (dto.memoryEnabled === false) {
      await this.prisma.roeyConversation.deleteMany({ where: { userId } });
      await this.audit(userId, "ROEY_MEMORY_PURGED");
    }
    return row;
  }

  async context(userId: string, month?: string) {
    return this.contextService.build(userId, month);
  }

  journey(userId: string) {
    return this.journeyService.forUser(userId);
  }

  async forecast(userId: string, month?: string) {
    const built = await this.contextService.build(userId, month);
    return {
      journey: built.journey,
      forecast: built.forecast,
      risk: built.risk,
      factsUsed: built.factsUsed,
    };
  }

  async chat(userId: string, dto: RoeyChatDto): Promise<RoeyChatResponse> {
    this.rateLimit(userId, "chat", 12, 60_000);
    const userMessage = dto.message.trim();
    if (this.containsLikelySecret(userMessage)) {
      throw new BadRequestException(
        "אין לשלוח ל-Roey סיסמה, API key או פרטי גישה",
      );
    }
    const connection = await this.requireConnection(userId);
    if (!connection.modelId) {
      throw new BadRequestException("יש לבחור מודל Google AI Studio");
    }
    const built = await this.contextService.build(userId, dto.month);
    const memoryEnabled = built.context.profile.memoryEnabled;
    const conversation = memoryEnabled
      ? await this.resolveExistingConversation(userId, dto.conversationId)
      : null;
    const historyRows = conversation
      ? await this.prisma.roeyMessage.findMany({
          where: { userId, conversationId: conversation.id },
          orderBy: { createdAt: "desc" },
          take: 8,
        })
      : [];
    const output = await this.google.generate(
      this.crypto.decrypt(connection.encryptedCredential),
      connection.modelId,
      built.context,
      historyRows.reverse().map((message) => ({
        role: message.role === "ASSISTANT" ? "model" : "user",
        content: message.contentHe,
      })),
      userMessage,
    );
    if (built.forecast.confidence === "LOW") output.confidence = "LOW";

    const persistedConversationId = memoryEnabled
      ? await this.prisma.$transaction(async (tx) => {
          const row =
            conversation ??
            (await tx.roeyConversation.create({
              data: {
                userId,
                titleHe: userMessage.slice(0, 80),
              },
            }));
          await tx.roeyMessage.createMany({
            data: [
              {
                userId,
                conversationId: row.id,
                role: "USER",
                contentHe: userMessage,
              },
              {
                userId,
                conversationId: row.id,
                role: "ASSISTANT",
                contentHe: output.messageHe,
                severity: built.risk.severity,
                confidence: output.confidence,
                sourcesJson: JSON.stringify(
                  built.factsUsed.map((fact) => fact.source),
                ),
                modelId: connection.modelId,
              },
            ],
          });
          await tx.roeyConversation.update({
            where: { id: row.id },
            data: { updatedAt: new Date() },
          });
          await tx.auditEvent.create({
            data: {
              userId,
              action: "ROEY_RESPONSE_GENERATED",
              meta: JSON.stringify({
                conversationId: row.id,
                modelId: connection.modelId,
                severity: built.risk.severity,
                confidence: output.confidence,
              }),
            },
          });
          return row.id;
        })
      : (await this.audit(userId, "ROEY_EPHEMERAL_RESPONSE_GENERATED", {
          modelId: connection.modelId,
          severity: built.risk.severity,
          confidence: output.confidence,
        }),
        null);

    return {
      conversationId: persistedConversationId,
      message: output,
      severity: built.risk.severity,
      risk: built.risk,
      journey: built.journey,
      factsUsed: built.factsUsed,
      forecast: built.forecast,
      modelId: connection.modelId,
    };
  }

  async conversations(userId: string) {
    return this.prisma.roeyConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 50 },
      },
    });
  }

  async deleteConversation(userId: string, conversationId: string) {
    const row = await this.prisma.roeyConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException("השיחה לא נמצאה");
    await this.prisma.roeyConversation.delete({
      where: { id: conversationId },
    });
    await this.audit(userId, "ROEY_CONVERSATION_DELETED", {
      conversationId,
    });
    return { ok: true };
  }

  private async requireConnection(userId: string) {
    const row = await this.prisma.roeyAiConnection.findUnique({
      where: { userId },
    });
    if (!row) {
      throw new BadRequestException(
        "יש לחבר את Roey ל-Google AI Studio תחילה",
      );
    }
    return row;
  }

  private async resolveExistingConversation(
    userId: string,
    conversationId: string | undefined,
  ) {
    if (!conversationId) return null;
    const existing = await this.prisma.roeyConversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!existing) throw new NotFoundException("השיחה לא נמצאה");
    return existing;
  }

  private containsLikelySecret(message: string) {
    return (
      /\bAIza[0-9A-Za-z_-]{30,}\b/.test(message) ||
      /\bsk-[0-9A-Za-z_-]{20,}\b/.test(message) ||
      /\b(api.?key|password|סיסמ[אה]|מפתח)\b.{0,20}[=: ]+[^\s]{20,}/i.test(
        message,
      )
    );
  }

  private rateLimit(
    userId: string,
    action: string,
    limit: number,
    windowMs: number,
  ) {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const recent = (this.rateWindows.get(key) || []).filter(
      (timestamp) => now - timestamp < windowMs,
    );
    if (recent.length >= limit) {
      throw new HttpException(
        "בוצעו יותר מדי בקשות ל-Roey. נסו שוב בעוד רגע",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.rateWindows.set(key, recent);
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

export type { GoogleModelOption };
