import { IsOptional, IsString, Length, MinLength } from "class-validator";

export class RedeemHouseholdDto {
  @IsString()
  @MinLength(4)
  code!: string;
}

export class CreateHouseholdInviteDto {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  labelHe?: string;
}
