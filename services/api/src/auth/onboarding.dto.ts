import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from "class-validator";
import { Type } from "class-transformer";

export class OnboardingCreditCardDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentBalance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;
}

export class OnboardingExpenseDto {
  @IsString()
  @MinLength(1)
  label!: string;

  @IsString()
  categoryKey!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  /** How the fixed expense is paid. Default ACCOUNT when omitted. */
  @IsOptional()
  @IsIn(["ACCOUNT", "CREDIT_CARD"])
  payVia?: "ACCOUNT" | "CREDIT_CARD";

  /** Index into creditCards[] when payVia = CREDIT_CARD. */
  @IsOptional()
  @IsInt()
  @Min(0)
  creditCardIndex?: number;
}

export class CompleteOnboardingDto {
  @IsString()
  @MinLength(1)
  accountName!: string;

  /** Ignored. Checking now follows cash-moving transactions. */
  @IsOptional()
  @IsNumber()
  startingBalance?: number;

  @IsNumber()
  @Min(0)
  monthlyIncomeNet!: number;

  /** Optional — omit or [] to skip cards in onboarding. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => OnboardingCreditCardDto)
  creditCards?: OnboardingCreditCardDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => OnboardingExpenseDto)
  fixedExpenses!: OnboardingExpenseDto[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  goalTitle?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  goalTargetAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  goalCurrentAmount?: number;
}
