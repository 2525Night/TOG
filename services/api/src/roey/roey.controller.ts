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
  ApproveRoeyActionDto,
  CreateRoeyActionProposalDto,
  RejectRoeyActionDto,
} from "./roey-action.dto";
import { RoeyActionService } from "./roey-action.service";
import { MarketDataService } from "./market-data.service";
import { RoeyNudgeService } from "./roey-nudge.service";
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
  constructor(
    private readonly roey: RoeyService,
    private readonly actions: RoeyActionService,
    private readonly market: MarketDataService,
    private readonly nudges: RoeyNudgeService,
  ) {}

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

  @Get("conversations/:id")
  conversation(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.roey.conversation(user.userId, id);
  }

  @Delete("conversations/:id")
  deleteConversation(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.roey.deleteConversation(user.userId, id);
  }

  @Get("actions")
  actionsList(@CurrentUser() user: AuthUser) {
    return this.actions.list(user.userId);
  }

  @Get("market")
  marketSnapshot() {
    return this.market.current();
  }

  @Post("actions/propose")
  proposeAction(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRoeyActionProposalDto,
  ) {
    return this.actions.propose(user.userId, dto);
  }

  @Post("actions/:id/approve")
  approveAction(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: ApproveRoeyActionDto,
  ) {
    return this.actions.approve(user.userId, id, dto);
  }

  @Post("actions/:id/reject")
  rejectAction(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: RejectRoeyActionDto,
  ) {
    return this.actions.reject(user.userId, id, dto);
  }

  @Get("nudges")
  nudgesList(@CurrentUser() user: AuthUser) {
    return this.nudges.list(user.userId);
  }

  @Post("nudges/:id/dismiss")
  dismissNudge(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.nudges.dismiss(user.userId, id);
  }

  @Post("nudges/:id/snooze")
  snoozeNudge(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.nudges.snooze(user.userId, id);
  }
}
