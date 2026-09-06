import {
  IsArray,
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

export class OnboardingExpenseDto {
  @IsString()
  @MinLength(1)
  label!: string;

  @IsString()
  categoryKey!: string;

  @IsNumber()
  @Min(0)
  amount!: number;
}

export class CompleteOnboardingDto {
  @IsString()
  @MinLength(1)
  accountName!: string;

  @IsNumber()
  @Min(0)
  startingBalance!: number;

  @IsNumber()
  @Min(0)
  monthlyIncomeNet!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => OnboardingExpenseDto)
  fixedExpenses!: OnboardingExpenseDto[];

  @IsString()
  @MinLength(1)
  goalTitle!: string;

  @IsNumber()
  @Min(1)
  goalTargetAmount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  goalCurrentAmount?: number;
}
