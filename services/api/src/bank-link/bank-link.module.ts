import { Module } from "@nestjs/common";
import { BankLinkController } from "./bank-link.controller";

@Module({
  controllers: [BankLinkController],
})
export class BankLinkModule {}
