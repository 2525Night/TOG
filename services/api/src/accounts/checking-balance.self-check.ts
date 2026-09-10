import assert from "node:assert/strict";
import {
  cashBalanceFromTransactions,
  cashSignedDelta,
} from "./checking-balance";

assert.equal(cashSignedDelta("INCOME", 6500), 6500);
assert.equal(cashSignedDelta("EXPENSE", 20), -20);
assert.equal(cashSignedDelta("EXPENSE", 80, "CARD_PURCHASE"), 0);
assert.equal(cashSignedDelta("EXPENSE", 80, "CARD_SETTLEMENT"), -80);
assert.equal(
  cashBalanceFromTransactions([
    { direction: "INCOME", amount: 6500 },
    { direction: "EXPENSE", amount: 20 },
  ]),
  6480,
);

console.log("checking-balance self-check passed");
