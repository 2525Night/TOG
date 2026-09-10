import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { AuthUser } from "./current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

type JwtPayload = { sub: string; email: string; role: "USER" | "ADMIN" };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET") || "dev-secret",
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const row = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { householdOwnerId: true },
    });
    return {
      userId: payload.sub,
      ledgerUserId: row?.householdOwnerId || payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
