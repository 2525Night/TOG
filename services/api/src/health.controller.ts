import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return {
      ok: true,
      product: "MoneyTail",
      assistant: "Roey",
      jurisdiction: "IL",
    };
  }
}
