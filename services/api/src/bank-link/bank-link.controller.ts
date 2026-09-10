import { Controller, Delete, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";

/**
 * Wave 4 scaffold: optional open-banking entry point.
 * No real connector — always returns not_available when UI is enabled.
 */
@Controller("bank-link")
@UseGuards(JwtAuthGuard)
export class BankLinkController {
  @Get("status")
  status(@CurrentUser() _user: AuthUser) {
    const uiEnabled =
      process.env.OPEN_BANKING_UI === "1" ||
      process.env.NEXT_PUBLIC_OPEN_BANKING_UI === "1" ||
      process.env.NODE_ENV !== "production";
    return {
      uiEnabled,
      available: false,
      status: "not_available" as const,
      reasonHe:
        "חיבור בנק אוטומטי עדיין לא זמין ב־MoneyTail5. ממשיכים בהזנה ידנית ובייבוא — בלי לוותר על השליטה.",
    };
  }

  @Post("connect")
  connect(@CurrentUser() _user: AuthUser) {
    return {
      ok: false,
      code: "NOT_AVAILABLE",
      reasonHe:
        "בנקאות פתוחה אופציונלית בדרך — כרגע אין חיבור. אפשר להמשיך עם תנועות וייבוא.",
    };
  }

  @Delete("disconnect")
  disconnect(@CurrentUser() _user: AuthUser) {
    return { ok: true, status: "not_connected" as const };
  }
}
