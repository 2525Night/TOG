# CURSOR TASK FINISHING CHECK

## Purpose

This is the **final quality gate** for a completed task.

Use this only after the requested feature, change, fix, or redesign has already been implemented.

The goal is not to redesign the task or expand its scope. The goal is to inspect the completed work end-to-end, repair anything incomplete or inconsistent, polish the result, verify integration with the existing system, run the appropriate checks, and close the task only when it is genuinely finished.

---

# 1. OPERATING MODE

Act as the final reviewer and finisher for the task.

Your responsibilities are:

**REVIEW → FIND GAPS → REPAIR → POLISH → TEST → VERIFY → CLOSE**

Do not assume that implementation success means task completion.

Inspect the actual repository and the actual implemented behavior.

Do not rely only on the previous agent's summary or claimed completion status.

---

# 2. SCOPE DISCIPLINE

First identify the exact task that was just implemented and its intended requirements.

Then establish the finishing boundary.

During this finishing pass:

- Do not introduce unrelated features.
- Do not redesign unrelated areas.
- Do not perform speculative refactors.
- Do not replace working architecture merely because another approach is possible.
- Do not silently expand product scope.
- Do not remove existing behavior unless the completed task explicitly requires it.
- Prefer small, targeted repairs over broad rewrites.

If you discover a larger architectural problem that is real but outside the task boundary, document it separately instead of silently expanding this task.

---

# 3. REQUIREMENT COMPLETENESS REVIEW

Reconstruct the requirements of the completed task from the available task context, implementation, plans, and relevant project documentation.

Create an internal checklist and verify every requirement against the actual implementation.

For every requirement classify it as:

- COMPLETE
- COMPLETE BUT NEEDS POLISH
- PARTIALLY COMPLETE
- MISSING
- BROKEN
- BLOCKED
- NOT APPLICABLE

Do not mark the task complete while required items remain PARTIALLY COMPLETE, MISSING, or BROKEN.

If something is BLOCKED, clearly identify the blocker and do not pretend the task is fully complete.

---

# 4. END-TO-END USER FLOW REVIEW

Test the feature as a user would experience it.

Do not inspect only isolated components.

Verify the complete journey:

**Entry → Interaction → Validation → State Change → Feedback → Persistence → Navigation → Revisit**

where applicable.

Check:

- Can the user find the feature naturally?
- Is the first screen understandable?
- Are primary actions obvious?
- Do actions produce the expected result?
- Is feedback immediate and understandable?
- Does saved/changed data remain correct after navigation or reload?
- Can the user return to the relevant information?
- Are related areas updated correctly?
- Are there dead ends?
- Are there unnecessary steps?
- Are there confusing labels or interactions?

Repair issues that belong to the current task.

---

# 5. UI / UX POLISH

Inspect every UI surface changed or affected by the task.

Check for:

- visual hierarchy
- spacing
- alignment
- typography
- component consistency
- button hierarchy
- readable numbers and labels
- clear financial/data semantics where applicable
- responsive behavior
- RTL behavior where applicable
- Hebrew layout and text behavior where applicable
- overflow
- clipping
- awkward wrapping
- inconsistent widths/heights
- inconsistent cards
- duplicate information
- unnecessary visual noise
- confusing empty space
- accidental horizontal scrolling
- broken icons
- missing tooltips where genuinely necessary
- inconsistent navigation states
- inconsistent selected/active states

The result should feel like part of the existing product, not a newly attached mini-application.

Do not overdecorate.

Clarity and usability come before visual novelty.

---

# 6. ALL RELEVANT UI STATES

Do not validate only the happy path.

Inspect and repair where applicable:

- populated state
- empty state
- first-use state
- loading state
- error state
- partial-data state
- stale-data state
- disabled state
- unavailable state
- validation errors
- long content
- large values
- zero values
- missing optional values
- multiple records
- single record

No state should look accidentally unfinished.

---

# 7. DATA CORRECTNESS

Verify that the feature displays and modifies the correct data.

Check:

- calculations
- totals
- subtotals
- percentages
- signs
- dates
- currencies
- rounding
- sorting
- filtering
- grouping
- relationships
- status derivation
- duplicate detection
- source/provenance where applicable
- synchronization between related records

Do not trust displayed values merely because the UI renders successfully.

Trace important values back to their source and calculation path.

For financial functionality, explicitly check for:

- double counting
- missing obligations
- incorrect income/expense classification
- duplicated transactions
- incorrect balance effects
- incorrect debt effects
- incorrect future commitments
- confusion between spending and cash movement

Financial correctness has priority over presentation.

---

# 8. CROSS-MODULE SYNCHRONIZATION

Identify every existing module affected by the completed task.

Verify that related surfaces remain synchronized.

Examples include:

- Dashboard
- Transactions
- Reports
- Cash Flow
- Accounts
- Loans
- Credit Cards
- Debt
- Goals
- Documents
- Notifications
- Search
- Filters
- Navigation

Do not create parallel sources of truth when an existing canonical model already exists.

Verify both directions of important relationships where appropriate.

Example:

**Record A → Related Record B**

and

**Record B → Related Record A**

A change in one place must not leave stale or contradictory information elsewhere.

---

# 9. PERSISTENCE AND STATE INTEGRITY

Where applicable, verify:

- create
- read
- update
- delete
- reload
- navigation away/back
- application restart behavior if relevant
- migrations
- default values
- optional values
- old records created before the change
- new records created after the change

Check backward compatibility with existing stored data.

Do not leave the application in a state where only newly created records work correctly.

---

# 10. ERROR HANDLING

Inspect realistic failure paths.

Check:

- invalid input
- missing required data
- failed requests
- unavailable backend/service
- malformed data
- unsupported records
- permission failures
- timeout/failure states where applicable

Errors should:

- fail safely
- preserve existing valid data
- provide understandable feedback
- avoid corrupting state
- avoid exposing internal implementation details or sensitive information

---

# 11. SECURITY AND PRIVACY REVIEW

Review security implications introduced by this task.

Check where relevant:

- authorization
- authentication boundaries
- user data isolation
- input validation
- output encoding
- sensitive information exposure
- secrets
- logs
- file handling
- API permissions
- direct database access
- client-side trust assumptions

Never weaken existing security boundaries merely to make the feature work.

Do not log secrets, credentials, tokens, or unnecessary sensitive user data.

---

# 12. ACCESSIBILITY AND INTERACTION QUALITY

Where applicable verify:

- keyboard usability
- focus behavior
- semantic controls
- labels
- contrast
- readable text
- clickable target sizes
- disabled-state clarity
- screen-reader-relevant semantics

Do not attempt a giant accessibility rewrite outside task scope, but repair accessibility regressions or obvious issues introduced by this task.

---

# 13. CODE QUALITY

Inspect all code added or materially changed by the task.

Look for:

- duplicated logic
- unnecessary complexity
- dead code
- temporary code
- debug output
- commented-out implementation
- placeholders
- TODO/FIXME/HACK markers introduced by the task
- unused imports
- unused components
- unused styles
- magic values
- inconsistent naming
- weak typing
- unsafe casts
- unnecessary dependencies
- business logic incorrectly placed in UI components
- duplicated sources of truth

Repair issues that are safely within the task boundary.

Do not perform broad aesthetic refactoring unrelated to completion.

---

# 14. ARCHITECTURE CONSISTENCY

Confirm that the implementation respects the existing architecture.

Verify:

- domain boundaries
- component boundaries
- service boundaries
- data ownership
- canonical sources of truth
- repository conventions
- naming conventions
- folder structure
- dependency direction

The task should integrate into the existing system instead of creating a second architecture beside it.

---

# 15. REGRESSION REVIEW

Identify existing behavior that could have been affected by the implementation.

Test those paths explicitly.

Pay particular attention to:

- shared components
- shared data models
- common calculations
- navigation
- forms
- filters
- database migrations
- APIs
- reports
- responsive layouts
- RTL layouts

A task is not finished if the new functionality works but existing functionality is broken.

---

# 16. TEST REVIEW

Review existing tests related to the changed area.

Determine whether the task requires:

- unit tests
- integration tests
- component tests
- end-to-end tests
- regression tests
- migration tests
- calculation tests

Add or update tests when they provide meaningful protection for behavior introduced or changed by this task.

Do not create meaningless tests merely to increase test count.

Important business rules and previously discovered bugs should receive regression coverage when practical.

---

# 17. RUN PROJECT VERIFICATION

Discover and use the repository's existing verification commands.

Do not invent a parallel verification process when the project already defines one.

Run all relevant checks, such as the project's equivalents of:

- formatting
- linting
- type checking
- unit tests
- integration tests
- build
- application compile
- relevant end-to-end checks

If the repository provides a canonical command such as `task verify`, `npm test`, `pnpm check`, or another project-specific verification command, prefer the established project workflow.

Do not claim a check passed unless it was actually run successfully.

If a check cannot be run, state exactly why.

---

# 18. BUILD / RUNTIME SANITY CHECK

Where practical, verify that the application actually starts/builds after the changes.

Check for:

- compile failures
- runtime exceptions
- broken imports
- missing environment assumptions
- invalid routes
- hydration/rendering errors
- console errors caused by the task
- obvious request failures

Passing static checks alone is not sufficient when runtime verification is available.

---

# 19. REMOVE IMPLEMENTATION RESIDUE

Before closure, search the task's changed area for residue left during development.

Remove or resolve where appropriate:

- debug logs
- temporary buttons
- test-only UI
- mock data accidentally left active
- placeholder text
- temporary feature flags
- unused experimental components
- commented code
- temporary styles
- abandoned files
- stale imports
- obsolete routes

Do not remove legitimate fixtures, diagnostics, or intentional development infrastructure simply because they resemble temporary code.

---

# 20. FINAL SELF-REVIEW

Before declaring completion, challenge the result.

Ask:

1. Did we satisfy the original task, not merely approximate it?
2. Is anything visibly unfinished?
3. Is anything functionally incomplete?
4. Is any data wrong or misleading?
5. Can the same information become inconsistent in two places?
6. Did we introduce double counting or duplicate records?
7. Did we break an existing workflow?
8. Did we introduce unnecessary complexity?
9. Did we accidentally expand scope?
10. Are there unhandled states?
11. Are there security/privacy regressions?
12. Are important business rules tested?
13. Did all relevant verification checks actually pass?
14. Would a normal user consider this feature finished?
15. Would another engineer consider this implementation safe to continue building on?

If the answer to any important question is no, continue repairing before closure.

---

# 21. DEFINITION OF DONE

The task may be marked **DONE** only when all applicable conditions are true:

- Original requirements are satisfied.
- Core user flows work end-to-end.
- UI is polished and consistent.
- Relevant empty/loading/error/edge states are handled.
- Data and calculations are correct.
- Related modules remain synchronized.
- Persistence works correctly.
- Existing data remains compatible where required.
- No relevant regression remains.
- No accidental duplicate source of truth was introduced.
- No temporary implementation residue remains.
- Security/privacy boundaries remain intact.
- Relevant tests exist and pass.
- Project verification passes.
- Build/runtime sanity checks pass where applicable.
- No known task-scoped blocker remains.

If any critical item fails, the task is **NOT DONE**.

---

# 22. FINAL OUTPUT FORMAT

At the end of the finishing pass, return a concise closure report using this structure:

## TASK FINISHING REPORT

### Status
`DONE` / `NOT DONE` / `BLOCKED`

### Reviewed
Briefly list the areas reviewed.

### Issues Found
List meaningful issues discovered during the finishing pass.

If none:
`No task-scoped issues found.`

### Repairs Made
List repairs performed during this pass.

If none:
`No additional repairs required.`

### Synchronization / Regression Check
State which related modules and workflows were checked and the result.

### Verification Executed
List the exact verification commands/checks actually executed and their real results.

Never report a command as passing if it was not executed.

### Remaining Issues
List only genuine unresolved issues.

If none:
`None.`

### Final Decision
Use exactly one:

`TASK_FINISHING_CHECK_PASSED`

or

`TASK_FINISHING_CHECK_FAILED`

or

`TASK_FINISHING_CHECK_BLOCKED`

---

# FINAL RULE

Do not optimize for declaring the task complete.

Optimize for determining whether it is **actually complete**.

If something is wrong and belongs to this task, repair it and verify again.

Only close the task when the implementation, user experience, data integrity, integration, and verification evidence support closure.

---

# 24. OPERATOR / PERSONAL PRODUCT PREFERENCES

These preferences are part of the finishing gate, not optional decoration.

When reviewing completed work, verify that the result follows these principles unless the specific task explicitly requires otherwise:

## User-first UX

- Prefer clarity, ease of use, and intuitive behavior over technical cleverness.
- The user should not need to understand the internal architecture to understand the interface.
- Common actions should be obvious and require as little friction as reasonably possible.
- Reduce unnecessary clicks, decisions, forms, and cognitive load.

## Creative, intuitive, and visually comfortable

- The finished experience should feel thoughtfully designed, not merely functional.
- Look for creative ways to make complex information easier to understand without making the interface gimmicky.
- Visual hierarchy must guide the eye naturally toward what matters most.
- Avoid clutter, visual noise, excessive density, or components competing for attention.
- Use spacing, grouping, hierarchy, progressive disclosure, and contextual actions deliberately.
- A page should feel calm and understandable at first glance.

## User-friendly by default

- Optimize for a normal end user, not the developer who built the feature.
- Labels, actions, navigation, feedback, validation, and error states must make sense without explanation.
- Important actions should be discoverable.
- Destructive or consequential actions must be clear and appropriately protected.
- Empty states should help the user understand what to do next.

## Simple language

- Do not expose unnecessarily technical, financial, architectural, database, API, or developer terminology in the user interface.
- Prefer plain, natural language.
- Keep labels concise and understandable.
- Explain complex concepts progressively when they cannot be avoided.
- Never simplify terminology in a way that changes its factual or financial meaning.

## Progressive disclosure

Prefer this information order whenever appropriate:

**Answer / Status → Meaning → Recommended or Available Action → Details**

Do not force users to read detailed tables or technical information before receiving the main answer.

## Integration over isolated features

- New functionality must feel native to the existing product.
- Reuse established navigation, components, patterns, terminology, data relationships, and business rules where appropriate.
- Do not create parallel systems for functionality that already exists.
- Verify cross-module synchronization and consistency.

## Preserve working systems

- Do not rewrite stable functionality simply to make the new task easier.
- Prefer compatible extension over unnecessary replacement.
- Existing working behavior is part of the regression surface.

## Evidence before DONE

A feature is not finished because the code looks correct.

Completion must be supported by actual inspection, appropriate tests, end-to-end verification, and validation of the user experience.

## Fix what you find

If a defect is clearly within the task scope and can be safely repaired, repair it during the finishing pass and verify the repair.

Do not merely list easy in-scope defects in the final report.

## No scope explosion

If an issue is legitimate but belongs to another task, document it separately.

Do not turn task finishing into an uncontrolled redesign or refactor.

---

# 25. MONEYTAIL-SPECIFIC FINAL GATE

Apply this section when the task belongs to the **MoneyTail** financial application.

MoneyTail must feel like a personal financial guidance and control product, not traditional accounting software and not a developer-facing financial database.

## MoneyTail UX identity

Every finished MoneyTail surface should be:

- Creative where creativity improves understanding.
- Intuitive.
- Visually comfortable and calm.
- Friendly to non-expert users.
- Modern and polished.
- Financially trustworthy.
- Simple without becoming simplistic.
- Consistent with the existing MoneyTail design language.
- Hebrew-first and RTL-first where applicable.

The user should generally receive the clearest financial conclusion first and be able to reveal deeper information when needed.

## MoneyTail language

Review all visible copy.

Avoid unnecessary professional jargon and complicated financial terminology.

When professional terminology is required for accuracy, preserve the correct term but provide a clear user-friendly explanation or context when appropriate.

Do not expose implementation terminology such as internal IDs, schemas, database concepts, provider payloads, API terminology, or developer errors to normal users.

## Financial correctness before visual cleverness

Never improve visual simplicity by making the underlying financial meaning inaccurate.

Verify, where relevant:

- totals
- balances
- income
- expenses
- liabilities
- loan balances
- credit-card obligations
- installments
- recurring payments
- cash flow
- future obligations
- period comparisons
- categorization
- transaction relationships

Make sure the same financial fact does not contradict itself across different MoneyTail screens.

## No double counting

Explicitly inspect for duplicate financial representation whenever the task touches transactions, credit cards, loans, transfers, settlements, installments, imports, or synchronized data sources.

A financial event may have several representations or relationships without becoming several expenses.

The finishing pass must verify that reports, dashboards, totals, and cash-flow calculations interpret these relationships correctly.

## Canonical Transactions integration

When a feature creates or consumes financial activity that belongs in the existing Transactions domain, verify synchronization with the canonical Transactions experience rather than creating an isolated transaction history.

Relationships should remain traceable where appropriate, for example:

**Transaction ↔ Credit Card**

**Transaction ↔ Loan / Loan Payment**

**Transaction ↔ Account**

**Transaction ↔ Category**

Changes must not leave stale or contradictory information elsewhere.

## Clear financial status before detail

For MoneyTail overview surfaces, ask:

> Can a normal user understand their situation within a few seconds?

Prioritize meaningful information such as:

- What is my situation?
- What changed?
- What requires attention?
- What is coming next?
- What can I safely spend or commit?
- Where can I improve?

Only then expose detailed records, calculations, histories, and supporting data.

## RTL and Hebrew quality

For Hebrew MoneyTail surfaces verify actual RTL behavior, not merely text alignment.

Inspect:

- navigation direction
- information hierarchy
- cards and grids
- icons and directional controls
- tables
- forms
- charts and labels
- currency formatting
- dates
- mixed Hebrew/English/numeric content
- truncation and wrapping
- mobile/responsive layouts where supported

The interface should feel designed for Hebrew from the beginning, not mirrored after implementation.

## Financial source and freshness

When MoneyTail displays information originating from integrations, uploaded documents, imported statements, market information, calculations, or other external sources, verify that source and freshness are handled appropriately.

Stale information must not silently appear current.

Uncertain, incomplete, estimated, calculated, and user-confirmed information should not be presented as equivalent when the distinction matters.

## Sensitive financial UX

MoneyTail handles highly sensitive information.

During finishing, verify that the feature does not unnecessarily expose sensitive financial data in logs, errors, debug output, URLs, analytics, notifications, or UI surfaces.

Privacy and security failures are task-completion failures, not future polish items.

## MoneyTail final experience test

Before closing a MoneyTail task, perform a final experience-oriented review and answer internally:

1. Is it immediately understandable?
2. Is it comfortable to look at and navigate?
3. Is the language simple enough for a normal user?
4. Is the most important financial information visually dominant?
5. Are deeper details available without overwhelming the first view?
6. Is every important number financially correct?
7. Is related information synchronized across the system?
8. Is anything duplicated or double-counted?
9. Does the feature feel native to MoneyTail?
10. Is there any obvious way to make the experience simpler without losing capability or accuracy?

If a meaningful in-scope improvement is discovered during this review, implement and verify it before declaring the task finished.

---

# 26. MONEYTAIL — אשראי / תשלומים (גל 1)

Apply this section when the task touches **credit cards, installment plans, card charges from Transactions or Debts, or month roll for installments**.

Canonical product doc: `SystemDoc/stage-credit-installments.md`  
Language: `SystemDoc/product-language-credit-loans.md`

## Scope of wave 1 (approved)

In scope:

- Same financial meaning when recording a card purchase / installment from **Transactions** and from **card detail**
- Explicit save feedback (this-month expense vs remaining installment commitment)
- Month roll: register due installment charges for the selected month without double-counting
- Delete/sync: removing a linked purchase or plan keeps balance + commitment consistent (no orphan plans)
- Clear semantics: cycle spend = selected month only; installment commitment = remaining

Out of scope for wave 1 (document, do not implement in the finishing pass):

- Standing order / recurring charge **via credit card** (`payVia: CREDIT_CARD` on budget commitments) — **wave 2**
- Editing installment deal amounts in place (delete + re-enter is the supported path)

## Wave 2 — standing via credit card

In scope:

- `BudgetCommitment.payVia` = `ACCOUNT` | `CREDIT_CARD` with optional `creditCardId`
- Save draft as fixed while payment method is card → card standing commitment
- Recording pending fixed items routes to `CARD_PURCHASE` when payVia is card
- Chip label distinguishes card vs account; fill-draft restores card selection
- MonthFacts matching treats card purchases as fulfillment of the commitment

Out of scope for wave 2:

- Editing payVia after create
- Auto-import of card standing from statements

## Finishing checklist — credit / installments

Before closing, verify against the live app:

### Wave 1
1. **Two doors, one meaning** — Save installment from Money and from card detail; totals, plan, and MonthFacts agree.
2. **Save feedback** — User sees this-month amount and remaining commitment (not a silent list refresh only).
3. **Month roll** — “רשום תשלומי אשראי לחודש” (or equivalent) for the selected month:
   - creates at most one purchase per plan for that month
   - skips if already recorded
   - catch-up advances `chargedCount` without fabricating old-month expenses
4. **Delete sync** — Delete linked tx or plan; card balance, installment commitment, overview, and money list stay consistent.
5. **No double count** — Only the monthly installment is an expense; remainder is commitment only.
6. **Blocked edit** — Changing amount/role on an installment-linked tx fails with a clear Hebrew message.
7. **Language** — No “חוב” as primary card label; use product-language terms.
8. **Ports smoke** — After a one-time port reset, API `:3001` and web `:3005` healthy; card charge + charge-due endpoints return success.

### Wave 2
9. **Card standing create** — Fixed commitment with card payVia persists and appears in fixed chips with a card cue.
10. **Card standing record** — Recording pending creates `CARD_PURCHASE` (not checking expense); card balance rises; commitment status becomes paid.
11. **Account standing unchanged** — Existing bank fixed flow still records `STANDARD` expenses.
12. **No confusion with installments** — Card standing is one full amount per month, not N payments.

Mark the wave complete in `SystemDoc/stage-credit-installments.md` only when this checklist is green.
