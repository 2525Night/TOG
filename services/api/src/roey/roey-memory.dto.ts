import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpsertRoeyMemoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  valueHe!: string;

  @IsOptional()
  @IsBoolean()
  userConfirmed?: boolean;
}
