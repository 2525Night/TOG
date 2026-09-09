import {
  BadRequestException,
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
    const apiKey = dto.apiKey.trim();
    const models = await this.google.listModels(apiKey);
    const preferred = this.google.preferredModel(models);
    const now = new Date();
    const row = await this.prisma.roeyAiConnection.upsert({
      where: { userId },
      create: {
        userId,
        encryptedCredential: this.crypto.encrypt(apiKey),
        keyHint: this.crypto.keyHint(apiKey),
        modelId: preferred.id,
        status: "CONNECTED",
        lastValidatedAt: now,
      },
      update: {
        encryptedCredential: this.crypto.encrypt(apiKey),
        keyHint: this.crypto.keyHint(apiKey),
        modelId: preferred.id,
        status: "CONNECTED",
        lastValidatedAt: now,
      },
    });
    await this.audit(userId, "ROEY_GOOGLE_CONNECTED", {
      modelId: preferred.id,
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

  async testConnection(dto: ConnectGoogleAiStudioDto) {
    const models = await this.google.listModels(dto.apiKey.trim());
    return {
      ok: true,
      models,
      recommendedModelId: this.google.preferredModel(models).id,
    };
  }

  async models(userId: string) {
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
    const connection = await this.requireConnection(userId);
    if (!connection.modelId) {
      throw new BadRequestException("יש לבחור מודל Google AI Studio");
    }
    const conversation = await this.resolveConversation(
      userId,
      dto.conversationId,
      dto.message,
    );
    const historyRows = await this.prisma.roeyMessage.findMany({
      where: { userId, conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    const built = await this.contextService.build(userId, dto.month);
    const output = await this.google.generate(
      this.crypto.decrypt(connection.encryptedCredential),
      connection.modelId,
      built.context,
      historyRows.reverse().map((message) => ({
        role: message.role === "ASSISTANT" ? "model" : "user",
        content: message.contentHe,
      })),
      dto.message.trim(),
    );
    if (built.forecast.confidence === "LOW") output.confidence = "LOW";

    await this.prisma.$transaction([
      this.prisma.roeyMessage.create({
        data: {
          userId,
          conversationId: conversation.id,
          role: "USER",
          contentHe: dto.message.trim(),
        },
      }),
      this.prisma.roeyMessage.create({
        data: {
          userId,
          conversationId: conversation.id,
          role: "ASSISTANT",
          contentHe: output.messageHe,
          severity: built.risk.severity,
          confidence: output.confidence,
          sourcesJson: JSON.stringify(built.factsUsed.map((fact) => fact.source)),
          modelId: connection.modelId,
        },
      }),
      this.prisma.roeyConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
      this.prisma.auditEvent.create({
        data: {
          userId,
          action: "ROEY_RESPONSE_GENERATED",
          meta: JSON.stringify({
            conversationId: conversation.id,
            modelId: connection.modelId,
            severity: built.risk.severity,
            confidence: output.confidence,
          }),
        },
      }),
    ]);

    return {
      conversationId: conversation.id,
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

  private async resolveConversation(
    userId: string,
    conversationId: string | undefined,
    firstMessage: string,
  ) {
    if (conversationId) {
      const existing = await this.prisma.roeyConversation.findFirst({
        where: { id: conversationId, userId },
      });
      if (!existing) throw new NotFoundException("השיחה לא נמצאה");
      return existing;
    }
    return this.prisma.roeyConversation.create({
      data: {
        userId,
        titleHe: firstMessage.trim().slice(0, 80),
      },
    });
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
