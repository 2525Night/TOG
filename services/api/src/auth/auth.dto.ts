import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { Transform } from "class-transformer";

export class RegisterDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1, { message: "נא להזין סיסמה" })
  password!: string;
}

export class ForgotPasswordDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  @MinLength(8, { message: "הסיסמה חייבת להכיל לפחות 8 תווים" })
  newPassword!: string;
}
