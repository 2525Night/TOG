import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from "class-validator";

export class CreateGoalDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsIn(["GENERAL", "EMERGENCY"])
  kind?: "GENERAL" | "EMERGENCY";

  @IsNumber()
  @Min(1)
  targetAmount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentAmount?: number;

  @IsOptional()
  @IsDateString()
  targetDate?: string;
}

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  targetAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentAmount?: number;

  @IsOptional()
  @IsDateString()
  targetDate?: string | null;
}

export class ApplySurplusDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  /** Preview→Confirm→Commit: must be true to commit. */
  @IsBoolean()
  confirm!: boolean;

  /** YYYY-MM — which budget month the allocation hits. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;
}

export class ReverseAllocationDto {
  @IsString()
  transactionId!: string;

  @IsBoolean()
  confirm!: boolean;
}

export class CreateStandingDto {
  @IsNumber()
  @Min(1)
  monthlyAmount!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(28)
  anchorDay?: number;

  /** YYYY-MM — defaults to current month on server. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  startMonth?: string;

  /** YYYY-MM — last month inclusive. Ignored when untilGoal is true. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  endMonth?: string;

  /** Number of months from startMonth (inclusive). Server derives endMonth. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  monthsCount?: number;

  /** Run until the goal is fully funded (no fixed end month). */
  @IsOptional()
  @IsBoolean()
  untilGoal?: boolean;
}

export class ApplyStandingRangeDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  fromMonth!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  toMonth!: string;

  @IsBoolean()
  confirm!: boolean;
}
