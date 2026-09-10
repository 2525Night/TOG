import {
  Equals,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import type { RoeyActionType } from "./roey-action.types";

export class CreateRoeyActionProposalDto {
  @IsIn([
    "ADD_TRANSACTION",
    "CREATE_COMMITMENT",
    "CHANGE_TRANSACTION_CATEGORY",
    "ALLOCATE_SURPLUS_TO_GOAL",
  ])
  type!: RoeyActionType;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  conversationId?: string;
}

export class ApproveRoeyActionDto {
  @Equals(true, { message: "נדרש אישור מפורש" })
  confirm!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  confirmationPhrase?: string;
}

export class RejectRoeyActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
