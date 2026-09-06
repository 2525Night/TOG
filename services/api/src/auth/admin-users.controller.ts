import { Controller, Get, UseGuards } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AdminGuard, JwtAuthGuard } from "./guards";

@Controller("admin/users")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        _count: { select: { transactions: true, accounts: true, goals: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
