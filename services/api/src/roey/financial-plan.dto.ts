import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class FinancialPlanMilestoneDto {
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  titleHe!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  targetAmount?: number;

  @IsOptional()
  @IsDateString()
  targetDate?: string;
}

export class FinancialPlanConstraintDto {
  @IsIn([
    "MIN_AVAILABLE",
    "MAX_NEW_DEBT",
    "PROTECTED_EXPENSE",
    "ACTION_LIMIT",
    "OTHER",
  ])
  type!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(240)
  labelHe!: string;

  @IsOptional()
  value?: unknown;

  @IsOptional()
  @IsBoolean()
  hard?: boolean;
}

export class UpsertFinancialPlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  objectiveHe!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  motivationHe?: string;

  @IsOptional()
  @IsIn([
    "STABILITY",
    "DEBT_REDUCTION",
    "EMERGENCY_BUFFER",
    "SAVING_GOAL",
    "CASHFLOW",
  ])
  priority?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(360)
  horizonMonths?: number;

  @IsOptional()
  @IsIn(["CONSERVATIVE", "BALANCED"])
  riskCapacity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nextActionHe?: string;

  @IsOptional()
  @IsDateString()
  reviewAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FinancialPlanMilestoneDto)
  milestones?: FinancialPlanMilestoneDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FinancialPlanConstraintDto)
  constraints?: FinancialPlanConstraintDto[];
}

export class ReviewFinancialPlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  summaryHe!: string;

  @IsOptional()
  @IsDateString()
  nextReviewAt?: string;
}
