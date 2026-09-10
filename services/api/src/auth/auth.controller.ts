import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from "./auth.dto";
import { CompleteOnboardingDto } from "./onboarding.dto";
import { JwtAuthGuard } from "./guards";
import { CurrentUser, AuthUser } from "./current-user.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post("forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post("reset-password")
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("onboarding/complete")
  completeOnboarding(
    @CurrentUser() user: AuthUser,
    @Body() dto: CompleteOnboardingDto,
  ) {
    return this.auth.completeOnboarding(user.userId, dto);
  }
}
