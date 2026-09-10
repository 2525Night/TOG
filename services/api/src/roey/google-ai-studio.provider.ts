import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { GoogleGenAI, type Content } from "@google/genai";
import { ROEY_SYSTEM_PROMPT } from "./roey-prompt";
import type { RoeyAgentOutput } from "./roey.types";

export type GoogleModelOption = {
  id: string;
  displayName: string;
  description: string;
  inputTokenLimit: number | null;
  outputTokenLimit: number | null;
};

type ProviderMessage = {
  role: "user" | "model";
  content: string;
};

@Injectable()
export class GoogleAiStudioProvider {
  async listModels(apiKey: string): Promise<GoogleModelOption[]> {
    try {
      const ai = this.client(apiKey);
      const pager = await ai.models.list({
        config: {
          pageSize: 100,
          queryBase: true,
          httpOptions: { timeout: 15_000 },
        },
      });
      const models: GoogleModelOption[] = [];
      for await (const model of pager) {
        const id = model.name || "";
        const actions = model.supportedActions || [];
        const supportsText =
          actions.length === 0 ||
          actions.some((action) => /generate.?content/i.test(action));
        if (!id || !supportsText || !this.isConversationalModel(id)) continue;
        models.push({
          id,
          displayName: model.displayName || id.replace(/^models\//, ""),
          description: model.description || "",
          inputTokenLimit: model.inputTokenLimit ?? null,
          outputTokenLimit: model.outputTokenLimit ?? null,
        });
        if (models.length >= 100) break;
      }
      if (models.length === 0) {
        throw new BadRequestException(
          "לא נמצאו מודלים של Gemini שתומכים בשיחה עבור המפתח הזה",
        );
      }
      return models.sort((a, b) => this.rank(a.id) - this.rank(b.id));
    } catch (error) {
      this.rethrow(error);
    }
  }

  async generate(
    apiKey: string,
    modelId: string,
    context: unknown,
    history: ProviderMessage[],
    userMessage: string,
  ): Promise<RoeyAgentOutput | null> {
    try {
      const contents: Content[] = [
        {
          role: "user",
          parts: [
            {
              text: `ROEY_CONTEXT:\n${JSON.stringify(context)}`,
            },
          ],
        },
        {
          role: "model",
          parts: [
            {
              text: "קיבלתי. אשתמש רק בהקשר המאומת שסיפקה MoneyTail.",
            },
          ],
        },
        ...history.slice(-8).map((message) => ({
          role: message.role,
          parts: [{ text: message.content }],
        })),
        {
          role: "user",
          parts: [{ text: userMessage }],
        },
      ];

      const response = await this.client(apiKey).models.generateContent({
        model: modelId,
        contents,
        config: {
          systemInstruction: ROEY_SYSTEM_PROMPT,
          temperature: 0.2,
          maxOutputTokens: 4096,
          httpOptions: { timeout: 25_000 },
        },
      });
      const text = response.text;
      if (!text) {
        throw new BadGatewayException("Google AI Studio החזיר תשובה ריקה");
      }
      return this.parseOutput(text);
    } catch (error) {
      this.rethrow(error);
    }
  }

  preferredModel(models: GoogleModelOption[]): GoogleModelOption {
    return (
      models.find((model) => /flash/i.test(model.id)) ??
      models[0]
    );
  }

  private client(apiKey: string) {
    return new GoogleGenAI({ apiKey });
  }

  private isConversationalModel(id: string) {
    return (
      /gemini/i.test(id) &&
      !/(embedding|image|imagen|veo|lyria|tts|live|robotics)/i.test(id)
    );
  }

  private rank(id: string) {
    if (/flash(?!.*lite)/i.test(id)) return 0;
    if (/pro/i.test(id)) return 1;
    if (/lite/i.test(id)) return 2;
    return 3;
  }

  private parseOutput(text: string): RoeyAgentOutput | null {
    let value: unknown;
    const trimmed = text.trim();
    const unfenced = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const objectStart = unfenced.indexOf("{");
    const objectEnd = unfenced.lastIndexOf("}");
    const candidates = [
      trimmed,
      unfenced,
      objectStart >= 0 && objectEnd > objectStart
        ? unfenced.slice(objectStart, objectEnd + 1)
        : "",
    ].filter(Boolean);
    for (const candidate of [...new Set(candidates)]) {
      try {
        value = JSON.parse(candidate);
        break;
      } catch {
        value = undefined;
      }
    }
    if (!value || typeof value !== "object") {
      if (
        unfenced.length >= 2 &&
        unfenced.length <= 4_000 &&
        !/^(?:\{|\[)/.test(unfenced)
      ) {
        return {
          messageHe: unfenced,
          recommendationHe: null,
          alternativesHe: [],
          questionHe: null,
          confidence: "MEDIUM",
        };
      }
      return null;
    }
    const output = value as Partial<RoeyAgentOutput> & {
      message?: unknown;
      answer?: unknown;
      text?: unknown;
    };
    const messageHe = [
      output.messageHe,
      output.message,
      output.answer,
      output.text,
    ].find((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (!messageHe) {
      return null;
    }
    const confidence = ["LOW", "MEDIUM", "HIGH"].includes(
      output.confidence || "",
    )
      ? (output.confidence as RoeyAgentOutput["confidence"])
      : "MEDIUM";
    return {
      messageHe: messageHe.slice(0, 4_000),
      recommendationHe:
        typeof output.recommendationHe === "string"
          ? output.recommendationHe.slice(0, 1_000)
          : null,
      alternativesHe: Array.isArray(output.alternativesHe)
        ? output.alternativesHe
            .filter((item): item is string => typeof item === "string")
            .slice(0, 3)
            .map((item) => item.slice(0, 800))
        : [],
      questionHe:
        typeof output.questionHe === "string"
          ? output.questionHe.slice(0, 800)
          : null,
      confidence,
    };
  }

  private rethrow(error: unknown): never {
    if (
      error instanceof BadRequestException ||
      error instanceof BadGatewayException ||
      error instanceof HttpException
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/429|quota|rate.?limit|resource.?exhausted/i.test(message)) {
      throw new HttpException(
        "מכסת Google AI Studio הסתיימה או שקצב הבקשות גבוה מדי",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (
      /api.?key|401|403|permission|unauthenticated|invalid argument/i.test(
        message,
      )
    ) {
      throw new BadRequestException(
        "מפתח Google AI Studio אינו תקין או שאין לו הרשאה",
      );
    }
    throw new BadGatewayException(
      "לא ניתן להתחבר כרגע ל-Google AI Studio",
    );
  }
}
