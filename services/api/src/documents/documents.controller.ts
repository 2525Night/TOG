import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";
import { DocumentsService } from "./documents.service";

@Controller("documents")
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.documents.list(user.userId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.documents.get(user.userId, id);
  }

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { storageMode?: "TEMPORARY" | "PERMANENT" },
  ) {
    return this.documents.upload(
      user.userId,
      file,
      body?.storageMode === "PERMANENT" ? "PERMANENT" : "TEMPORARY",
    );
  }

  @Post(":id/confirm")
  confirm(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body()
    body: {
      selectedIndexes?: number[];
      overrides?: Array<{
        index: number;
        direction?: "INCOME" | "EXPENSE" | "TRANSFER";
        categoryKey?: string;
        description?: string;
      }>;
    },
  ) {
    return this.documents.confirm(
      user.userId,
      id,
      body?.selectedIndexes,
      body?.overrides,
    );
  }

  @Post(":id/reject")
  reject(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.documents.reject(user.userId, id);
  }

  @Post(":id/undo")
  undo(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.documents.undoImport(user.userId, id);
  }
}
