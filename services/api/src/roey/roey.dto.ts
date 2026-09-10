import {
  Equals,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class ConnectGoogleAiStudioDto {
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  apiKey!: string;

  @Equals(true, {
    message: "נדרשת הסכמה לשליחת הקשר פיננסי מצומצם ל-Google",
  })
  consent!: boolean;
}

export class SelectRoeyModelDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  modelId!: string;
}

export class UpdateRoeyProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  primaryGoal?: string;

  @IsOptional()
  @IsIn(["CONCISE", "BALANCED", "EXPLANATORY"])
  tone?: "CONCISE" | "BALANCED" | "EXPLANATORY";

  @IsOptional()
  @IsIn(["GENTLE", "BALANCED", "ASSERTIVE"])
  assertiveness?: "GENTLE" | "BALANCED" | "ASSERTIVE";

  @IsOptional()
  @IsIn(["OFF", "IMPORTANT_ONLY", "WEEKLY"])
  notificationMode?: "OFF" | "IMPORTANT_ONLY" | "WEEKLY";

  @IsOptional()
  @IsBoolean()
  memoryEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  onboardingSeen?: boolean;
}

export class RoeyChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  conversationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  month?: string;
}
