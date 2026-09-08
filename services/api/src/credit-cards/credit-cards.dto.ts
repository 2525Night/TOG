import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";

export class CreateCreditCardDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  lastFour?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentBalance?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  billingDay?: number;

  @IsOptional()
  @IsDateString()
  nextBillingDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCreditCardDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  provider?: string | null;

  @IsOptional()
  @IsString()
  lastFour?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentBalance?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  billingDay?: number | null;

  @IsOptional()
  @IsDateString()
  nextBillingDate?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class CreateInstallmentPlanDto {
  @IsString()
  @MinLength(1)
  titleHe!: string;

  @IsNumber()
  @Min(0.01)
  originalAmount!: number;

  @IsInt()
  @Min(2)
  installmentCount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  installmentAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  chargedCount?: number;

  @IsString()
  startMonth!: string;

  @IsOptional()
  @IsString()
  linkedPurchaseTxId?: string;
}

export class UpdateInstallmentPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  titleHe?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  chargedCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  installmentAmount?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** One-time card purchase or installment purchase (first charge this month). */
export class RecordCardChargeDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  categoryKey!: string;

  @IsDateString()
  bookedAt!: string;

  /** 1 = one-time; >=2 creates InstallmentPlan + this-month installment charge */
  @IsOptional()
  @IsInt()
  @Min(1)
  installmentCount?: number;
}
