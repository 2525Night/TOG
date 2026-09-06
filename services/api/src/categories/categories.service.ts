import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function slugifyLabel(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `cat-${Date.now().toString(36)}`;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, direction?: string) {
    const where: { userId: string; direction?: string } = { userId };
    if (direction === "INCOME" || direction === "EXPENSE") {
      where.direction = direction;
    }
    return this.prisma.userCategory.findMany({
      where,
      orderBy: { labelHe: "asc" },
    });
  }

  async create(
    userId: string,
    body: {
      labelHe: string;
      direction?: "EXPENSE" | "INCOME";
      nature?: "fixed" | "variable" | "periodic";
    },
  ) {
    const labelHe = (body.labelHe || "").trim();
    if (!labelHe) throw new BadRequestException("שם קטגוריה חסר");
    const direction = body.direction === "INCOME" ? "INCOME" : "EXPENSE";
    const nature =
      body.nature === "fixed" || body.nature === "periodic"
        ? body.nature
        : "variable";

    let key = `custom:${slugifyLabel(labelHe)}`;
    const existing = await this.prisma.userCategory.findFirst({
      where: { userId, key },
    });
    if (existing) {
      key = `custom:${slugifyLabel(labelHe)}-${Date.now().toString(36).slice(-4)}`;
    }

    return this.prisma.userCategory.create({
      data: { userId, key, labelHe, nature, direction },
    });
  }
}
