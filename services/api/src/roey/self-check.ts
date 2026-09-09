import assert from "node:assert/strict";
import { ConfigService } from "@nestjs/config";
import { RoeyCryptoService } from "./roey-crypto.service";
import {
  classifyRoeyRisk,
  computeRoeyForecast,
} from "./roey-forecast.service";
import { deriveRoeyJourney } from "./roey-journey.service";

const now = new Date("2026-09-09T12:00:00.000Z");

const introduction = deriveRoeyJourney({
  createdAt: new Date("2026-09-01T12:00:00.000Z"),
  onboardingCompleted: true,
  transactions: [],
  now,
});
assert.equal(introduction.stage, "INTRODUCTION");
assert.equal(introduction.signalsReliable, false);

const established = deriveRoeyJourney({
  createdAt: new Date("2026-01-01T12:00:00.000Z"),
  onboardingCompleted: true,
  transactions: [
    ...monthTransactions("2026-07"),
    ...monthTransactions("2026-08"),
  ],
  now,
});
assert.equal(established.stage, "ESTABLISHED");
assert.equal(established.reliableMonths, 2);

const forecast = computeRoeyForecast({
  startingAvailable: 5_000,
  expectedIncome: 8_000,
  expectedFixedExpenses: 5_000,
  expectedFlexibleExpenses: 2_000,
  debtPrincipal: 0,
  completeness: 90,
  signalsReliable: true,
});
assert.equal(forecast.confidence, "HIGH");
assert.equal(
  forecast.scenarios.find((item) => item.id === "BASE")?.points[2]
    .projectedAvailable,
  8_000,
);
assert.equal(classifyRoeyRisk(forecast).severity, "INFO");

const risky = computeRoeyForecast({
  startingAvailable: 200,
  expectedIncome: 5_000,
  expectedFixedExpenses: 4_500,
  expectedFlexibleExpenses: 1_500,
  debtPrincipal: 0,
  completeness: 80,
  signalsReliable: true,
});
assert.equal(classifyRoeyRisk(risky).severity, "CRITICAL");

const lowConfidenceRisk = computeRoeyForecast({
  startingAvailable: 200,
  expectedIncome: 5_000,
  expectedFixedExpenses: 4_500,
  expectedFlexibleExpenses: 1_500,
  debtPrincipal: 0,
  completeness: 20,
  signalsReliable: false,
});
assert.equal(lowConfidenceRisk.confidence, "LOW");
assert.equal(classifyRoeyRisk(lowConfidenceRisk).severity, "WARNING");

const crypto = new RoeyCryptoService(
  new ConfigService({
    ROEY_CREDENTIALS_ENCRYPTION_KEY:
      "test-key-with-more-than-thirty-two-characters",
  }),
);
const encrypted = crypto.encrypt("example-secret");
assert.notEqual(encrypted, "example-secret");
assert.equal(crypto.decrypt(encrypted), "example-secret");

console.log("Roey self-check passed");

function monthTransactions(month: string) {
  return [
    { bookedAt: new Date(`${month}-01T12:00:00.000Z`), direction: "INCOME" },
    { bookedAt: new Date(`${month}-05T12:00:00.000Z`), direction: "EXPENSE" },
    { bookedAt: new Date(`${month}-12T12:00:00.000Z`), direction: "EXPENSE" },
  ];
}
