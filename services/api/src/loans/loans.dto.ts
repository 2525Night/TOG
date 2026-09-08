import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";

export class CreateLoanDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsNumber()
  @Min(0)
  originalAmount!: number;

  @IsNumber()
  @Min(0)
  principalBalance!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyPayment?: number;

  @IsOptional()
  @IsNumber()
  aprPercent?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateLoanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  provider?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  originalAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  principalBalance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyPayment?: number;

  @IsOptional()
  @IsNumber()
  aprPercent?: number | null;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsDateString()
  nextDueDate?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
