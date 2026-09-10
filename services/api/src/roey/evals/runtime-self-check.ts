import assert from "node:assert/strict";
import { classifyActionImpact } from "../roey-action.policy";
import { classifyRoeyIntent } from "../roey-orchestrator.service";
import {
  ROEY_RUNTIME_VERSION,
  ROEY_TURN_BUDGET,
} from "../roey-runtime.types";

const intentCases = [
  ["היי רועי, מה המצב שלי?", "EXPLAIN"],
  ["מה יקרה אם ההוצאות יעלו?", "EXPLORE"],
  ["מה אם אני אבטל את המסעדות לחודש?", "EXPLORE"],
  ["כמה הוצאתי על מסעדות?", "EXPLAIN"],
  ["אני רוצה לבנות תוכנית לצאת מהמינוס", "PLAN"],
  ["תוסיף הוצאה של 120 שקל על אוכל", "ACTION"],
  ["היתרה לא נכונה, למה זה לא תואם?", "DISPUTE"],
  ["איזו מניה כדאי לי לקנות?", "REGULATED"],
  ["כמה מס הכנסה כדאי לי לשלם?", "REGULATED"],
  ["פרצו לי לחשבון עכשיו", "VULNERABILITY"],
  ["מה הצעד הבא בתוכנית שלי?", "EXPLAIN"],
] as const;

for (const [message, expected] of intentCases) {
  assert.equal(classifyRoeyIntent(message), expected, message);
}

assert.equal(ROEY_RUNTIME_VERSION, "roey-runtime-v2");
assert.equal(ROEY_TURN_BUDGET.maxModelCalls, 3);
assert.equal(ROEY_TURN_BUDGET.maxToolCalls, 5);
assert.equal(ROEY_TURN_BUDGET.maxDurationMs, 30_000);

assert.equal(classifyActionImpact(1_000, -50).severity, "CRITICAL");
assert.equal(classifyActionImpact(1_000, 600).severity, "INFO");
assert.equal(classifyActionImpact(1_000, 300).severity, "WARNING");

console.log("Roey runtime golden checks passed");
