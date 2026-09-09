import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  TooManyRequestsException,
} from "@nestjs/common";
import { GoogleGenAI, type Content } from "@google/genai";
import { ROEY_SYSTEM_PROMPT } from "./roey-prompt";
import {
  ROEY_RESPONSE_JSON_SCHEMA,
  type RoeyAgentOutput,
} from "./roey.types";

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
        config: { pageSize: 100, queryBase: true },
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
  ): Promise<RoeyAgentOutput> {
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
          maxOutputTokens: 900,
          responseMimeType: "application/json",
          responseJsonSchema: ROEY_RESPONSE_JSON_SCHEMA,
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

  private parseOutput(text: string): RoeyAgentOutput {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new BadGatewayException("המודל החזיר תשובה במבנה לא תקין");
    }
    if (!value || typeof value !== "object") {
      throw new BadGatewayException("המודל החזיר תשובה במבנה לא תקין");
    }
    const output = value as Partial<RoeyAgentOutput>;
    if (
      typeof output.messageHe !== "string" ||
      !["LOW", "MEDIUM", "HIGH"].includes(output.confidence || "")
    ) {
      throw new BadGatewayException("המודל החזיר תשובה חסרה");
    }
    return {
      messageHe: output.messageHe.slice(0, 4_000),
      recommendationHe:
        typeof output.recommendationHe === "string"
          ? output.recommendationHe.slice(0, 1_000)
          : null,
      alternativesHe: Array.isArray(output.alternativesHe)
        ? output.alternativesHe
            .filter((item): item is string => typeof item === "string")
            .slice(0, 2)
            .map((item) => item.slice(0, 800))
        : [],
      questionHe:
        typeof output.questionHe === "string"
          ? output.questionHe.slice(0, 800)
          : null,
      confidence: output.confidence as RoeyAgentOutput["confidence"],
    };
  }

  private rethrow(error: unknown): never {
    if (
      error instanceof BadRequestException ||
      error instanceof BadGatewayException ||
      error instanceof TooManyRequestsException
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/429|quota|rate.?limit|resource.?exhausted/i.test(message)) {
      throw new TooManyRequestsException(
        "מכסת Google AI Studio הסתיימה או שקצב הבקשות גבוה מדי",
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
