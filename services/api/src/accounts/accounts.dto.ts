import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MinLength } from "class-validator";
import { AccountKind } from "@prisma/client";

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(AccountKind)
  kind!: AccountKind;

  @IsOptional()
  @IsNumber()
  currentBalance?: number;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(AccountKind)
  kind?: AccountKind;

  @IsOptional()
  @IsNumber()
  currentBalance?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
