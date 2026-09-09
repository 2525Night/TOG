import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthUser, CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards";
import {
  ConnectGoogleAiStudioDto,
  RoeyChatDto,
  SelectRoeyModelDto,
  UpdateRoeyProfileDto,
} from "./roey.dto";
import { RoeyService } from "./roey.service";

@Controller("roey")
@UseGuards(JwtAuthGuard)
export class RoeyController {
  constructor(private readonly roey: RoeyService) {}

  @Get("connections/google-ai-studio")
  connection(@CurrentUser() user: AuthUser) {
    return this.roey.connection(user.userId);
  }

  @Post("connections/test")
  testConnection(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConnectGoogleAiStudioDto,
  ) {
    return this.roey.testConnection(user.userId, dto);
  }

  @Post("connections/google-ai-studio")
  connect(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConnectGoogleAiStudioDto,
  ) {
    return this.roey.connect(user.userId, dto);
  }

  @Get("connections/models")
  models(@CurrentUser() user: AuthUser) {
    return this.roey.models(user.userId);
  }

  @Patch("connections/model")
  selectModel(
    @CurrentUser() user: AuthUser,
    @Body() dto: SelectRoeyModelDto,
  ) {
    return this.roey.selectModel(user.userId, dto);
  }

  @Delete("connections/google-ai-studio")
  disconnect(@CurrentUser() user: AuthUser) {
    return this.roey.disconnect(user.userId);
  }

  @Get("profile")
  profile(@CurrentUser() user: AuthUser) {
    return this.roey.profile(user.userId);
  }

  @Patch("profile")
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateRoeyProfileDto,
  ) {
    return this.roey.updateProfile(user.userId, dto);
  }

  @Get("journey")
  journey(@CurrentUser() user: AuthUser) {
    return this.roey.journey(user.userId);
  }

  @Get("context")
  context(
    @CurrentUser() user: AuthUser,
    @Query("month") month?: string,
  ) {
    return this.roey.context(user.userId, month);
  }

  @Get("forecast")
  forecast(
    @CurrentUser() user: AuthUser,
    @Query("month") month?: string,
  ) {
    return this.roey.forecast(user.userId, month);
  }

  @Post("chat")
  chat(@CurrentUser() user: AuthUser, @Body() dto: RoeyChatDto) {
    return this.roey.chat(user.userId, dto);
  }

  @Get("conversations")
  conversations(@CurrentUser() user: AuthUser) {
    return this.roey.conversations(user.userId);
  }

  @Delete("conversations/:id")
  deleteConversation(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.roey.deleteConversation(user.userId, id);
  }
}
