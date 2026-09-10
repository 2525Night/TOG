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
  ReviewFinancialPlanDto,
  UpsertFinancialPlanDto,
} from "./financial-plan.dto";
import { FinancialPlanService } from "./financial-plan.service";
import { UpsertRoeyMemoryDto } from "./roey-memory.dto";
import { RoeyMemoryService } from "./roey-memory.service";
import { RoeyReconciliationService } from "./roey-reconciliation.service";
import { RoeyEscalationService } from "./roey-escalation.service";
import { RoeyOrchestratorService } from "./roey-orchestrator.service";
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
    private readonly financialPlan: FinancialPlanService,
    private readonly memory: RoeyMemoryService,
    private readonly reconciliation: RoeyReconciliationService,
    private readonly escalations: RoeyEscalationService,
    private readonly orchestrator: RoeyOrchestratorService,
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

  @Get("plan")
  plan(@CurrentUser() user: AuthUser) {
    return this.financialPlan.get(user.userId);
  }

  @Patch("plan")
  upsertPlan(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertFinancialPlanDto,
  ) {
    return this.financialPlan.upsert(user.userId, dto);
  }

  @Post("plan/review")
  reviewPlan(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewFinancialPlanDto,
  ) {
    return this.financialPlan.review(user.userId, dto);
  }

  @Get("memory")
  memoryList(@CurrentUser() user: AuthUser) {
    return this.memory.list(user.userId);
  }

  @Post("memory")
  upsertMemory(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertRoeyMemoryDto,
  ) {
    return this.memory.upsert(user.userId, dto);
  }

  @Delete("memory/:id")
  forgetMemory(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.memory.forget(user.userId, id);
  }

  @Get("outcomes")
  outcomes(@CurrentUser() user: AuthUser) {
    return this.reconciliation.reconcileDue(user.userId);
  }

  @Get("escalations")
  escalationList(@CurrentUser() user: AuthUser) {
    return this.escalations.list(user.userId);
  }

  @Post("escalations/:id/approve-handoff")
  approveEscalationHandoff(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.escalations.approveHandoff(user.userId, id);
  }

  @Post("escalations/:id/dismiss")
  dismissEscalation(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.escalations.dismiss(user.userId, id);
  }

  @Get("runs")
  runs(@CurrentUser() user: AuthUser) {
    return this.orchestrator.recentRuns(user.userId);
  }
}
