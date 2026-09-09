# Roey Runtime Contract

Version: `roey-runtime-v2`

## Purpose

Roey is a stateful financial-journey agent. The language model may interpret,
plan and explain, but MoneyTail owns facts, calculations, policy, authority,
tool execution and completion claims.

## Runtime state machine

Every user turn creates a durable run:

`ANALYZE → RETRIEVE → PLAN → RESPOND | PROPOSE → AWAIT_APPROVAL → VERIFY → COMPLETE`

At any point the run may enter:

- `CLARIFY` when required information is missing.
- `ESCALATE` for regulated, vulnerable, disputed or out-of-scope needs.
- `FAILED` after a bounded retry budget is exhausted.

Limits per turn:

- Maximum model calls: 3.
- Maximum tool calls: 5.
- Maximum elapsed time: 30 seconds.
- No delegation in v2.
- A run must stop when it reaches `COMPLETE`, `AWAIT_APPROVAL`,
  `ESCALATE` or `FAILED`.

## Intent contract

The orchestrator classifies a turn as one of:

- `EXPLAIN` — explain a verified fact or calculation.
- `EXPLORE` — compare scenarios without recommending execution.
- `PLAN` — create or revise the user's living financial plan.
- `ACTION` — prepare a bounded MoneyTail action.
- `DISPUTE` — challenge a fact, category, balance or prior outcome.
- `REGULATED` — investment, tax, legal, credit or insurance advice.
- `VULNERABILITY` — fraud, coercion, bereavement, insolvency or severe distress.

Ambiguous `PLAN`, `ACTION`, `DISPUTE`, `REGULATED` and `VULNERABILITY`
requests must be clarified before consequential output.

## Living financial plan

The plan is distinct from chat history. It contains:

- Objective and motivation.
- Priority and time horizon.
- Hard constraints and user boundaries.
- Milestones and dependencies.
- Current next action.
- Assumptions and data-quality requirements.
- Review date and material-change triggers.
- Versioned timeline explaining every revision.

Roey may draft a change. The user owns the plan and can accept, reject or
correct every remembered element.

## Fact and evidence contract

Every fact has:

- Stable `factId`.
- Type and value.
- Source and source record.
- Observation time and retrieval time.
- Reliability and freshness.
- Formula or transformation version.

Every material model claim must cite one or more `factId` values. The output
validator rejects:

- Unknown citations.
- Unsupported numbers, dates, categories or capabilities.
- Causal claims not supplied by a deterministic MoneyTail service.
- Claims that contradict policy severity or data quality.

## Capability and authority contract

The model receives a generated capability manifest on every turn. The manifest
is the only source of truth for what MoneyTail can read or do.

Tools are server-owned, typed and independently authorized. Tool output is
untrusted input to the next model step. Side effects always pass through:

`validate → simulate → authorize → execute idempotently → reconcile`

An approval binds to the exact user, tool, arguments, impact snapshot, policy
version and expiry. Materially changed facts invalidate the approval.

## Memory contract

- Working memory: current run state and selected context pack.
- Episodic memory: summarized sessions and decisions.
- Semantic memory: user-confirmed goals, constraints and preferences.
- Financial facts are never learned from conversation memory.

Every semantic memory item has source, confidence, confirmation, retention and
correction/deletion controls. `memoryEnabled=false` disables retrieval and
purges optional episodic and semantic memory.

## Escalation contract

Roey stops autonomous guidance and opens an escalation when it detects:

- Fraud, coercion, abuse or account takeover.
- Insolvency, inability to meet basic needs or severe debt distress.
- Bereavement or observable vulnerability.
- A dispute the available evidence cannot resolve.
- Personalized investment, tax, legal, insurance or regulated credit advice.
- Repeated tool/model failure or conflicting authoritative facts.

The handoff contains only a user-approved summary, evidence IDs, urgency and
unresolved questions.

## Verification and completion

Roey may claim completion only after a tool postcondition succeeds. API
acceptance means `SUBMITTED`, not necessarily `COMPLETED`.

Each run records:

- Runtime, prompt, policy, model and tool versions.
- Context hash and cited fact IDs.
- Model/tool/policy spans.
- Approval and execution IDs.
- Postcondition and reconciliation result.
- Latency, token usage and safe failure code.

## Evaluation gate

Changes to model, prompt, context, tools, policy or memory schema must pass:

- Hebrew multi-turn task completion.
- Fact citation and contradiction tests.
- Tool-selection and argument tests.
- Approval, permission and tenant-isolation tests.
- Partial/stale-data and tool-failure tests.
- Prompt-injection and poisoned-memory tests.
- Forecast-to-actual outcome checks.
- Human review for high-risk regression cases.
