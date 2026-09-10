import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type AuthUser = {
  /** Authenticated actor (JWT subject). */
  userId: string;
  /** Ledger owner — self, or household owner when linked as partner. */
  ledgerUserId: string;
  email: string;
  role: "USER" | "ADMIN";
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
