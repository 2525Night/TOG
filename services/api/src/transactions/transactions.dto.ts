import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { TxDirection } from "@prisma/client";

export class CreateTransactionDto {
  @IsEnum(TxDirection)
  direction!: TxDirection;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  categoryKey!: string;

  @IsDateString()
  bookedAt!: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsEnum(TxDirection)
  direction?: TxDirection;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  categoryKey?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}
