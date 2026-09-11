import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

const KINDS = ["SUCCESS", "ERROR", "INFO", "IMPORTANT", "NUDGE"] as const;
const SOURCES = [
  "MONEY",
  "CASH",
  "ROEY",
  "DEBTS",
  "GOALS",
  "SETTINGS",
  "SYSTEM",
] as const;

export class CreateNotificationDto {
  @IsIn(KINDS)
  kind!: (typeof KINDS)[number];

  @IsIn(SOURCES)
  source!: (typeof SOURCES)[number];

  @IsString()
  @MaxLength(160)
  titleHe!: string;

  @IsString()
  @MaxLength(800)
  bodyHe!: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  actionUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ttlSeconds?: number;

  @IsOptional()
  @IsBoolean()
  osEligible?: boolean;

  @IsOptional()
  @IsBoolean()
  toast?: boolean;
}

export class UpdateNotificationPrefsDto {
  @IsOptional()
  @IsBoolean()
  toastEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  saveSuccessToUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  roeyNudgesInCenter?: boolean;

  @IsOptional()
  @IsBoolean()
  osNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  osImportant?: boolean;

  @IsOptional()
  @IsBoolean()
  osNudge?: boolean;

  @IsOptional()
  @IsBoolean()
  osWeeklyDigest?: boolean;

  @IsOptional()
  @IsBoolean()
  osActionErrors?: boolean;

  @IsOptional()
  @IsBoolean()
  osSuccess?: boolean;
}
