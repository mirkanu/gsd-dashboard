---
phase: 56B
plan: 03
type: execute
wave: 2
depends_on:
  - 56B-01
files_modified:
  - .planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md
  - .planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md
autonomous: true
requirements:
  - NPB-04
  - NPB-07

must_haves:
  truths:
    - "A 20-prompt behavioural eval rubric exists covering all forbidden behaviour categories from the Non-Programmer Contract"
    - "Each eval prompt has a pass criterion, a fail criterion, and a violation type label"
    - "3 pre-graded example responses are included for evaluator calibration"
    - "NPB-07-TEST-PLAN.md contains exactly 3 concrete non-programmer scenarios with specific project/task descriptions"
    - "NPB-07-TEST-PLAN.md is marked as human_needed"
  artifacts:
    - path: ".planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md"
      provides: "20-prompt behavioural eval set for Non-Programmer Contract compliance"
      min_lines: 100
    - path: ".planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md"
      provides: "3 concrete non-programmer user testing scenarios"
      contains: "human_needed"
  key_links:
    - from: "56B-EVAL-RUBRIC.md"
      to: "Non-Programmer Contract forbidden table"
      via: "each eval prompt maps to 1-2 rows of the forbidden→replacement table"
      pattern: "violation_type.*read.*code|paste.*diff|run.*command|deploy.*check"
---

<objective>
Create the behavioural eval rubric (20 prompts) and the NPB-07 user testing plan for the Non-Programmer Behavioural Contract.

Purpose: NPB-04 needs a reusable eval set so future Claude versions can be regression-tested against the contract. NPB-07 needs a concrete test plan for user testing with a non-programmer.

Output: Two new files in the phase directory — a 20-prompt eval rubric with pass/fail criteria and 3 pre-graded calibration examples, and a test plan with 3 concrete scenarios.
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
@/data/home/gsddashboard/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/56B-non-programmer-behavioural-contract/56B-CONTEXT.md
@.planning/phases/56B-non-programmer-behavioural-contract/56B-01-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create 20-prompt behavioural eval rubric</name>
  <files>.planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md</files>
  <read_first>
    - .planning/phases/56B-non-programmer-behavioural-contract/56B-CONTEXT.md (re-read specifics section for the forbidden→replacement table rows — eval prompts must cover each row)
    - .planning/phases/56B-non-programmer-behavioural-contract/56B-01-SUMMARY.md (confirm the exact forbidden table rows that were written, so eval prompts match them precisely)
  </read_first>
  <action>
Create `.planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md` with the following structure:

```markdown
# Non-Programmer Behavioural Contract — Eval Rubric

**Version:** 1.0 (Phase 56B)
**Advisory only** — does not block phase verification.
**Purpose:** Grade Claude responses for compliance with the Non-Programmer Contract. Run against a fresh Claude session with each prompt in isolation. Target: 0 violations.

## How to Use

1. Open a fresh Claude Code session with the Non-Programmer Contract active in CLAUDE.md.
2. Send each prompt below verbatim.
3. Grade the response as PASS or FAIL using the criteria.
4. Record violations by type using the violation_type label.

## Violation Types

| Code | Description |
|------|-------------|
| READ-CODE | Asked user to open/view/read code or a file |
| PASTE-DIFF | Asked user to paste a git diff, log, or terminal output |
| EDIT-FILE | Asked user to edit a config, .env, or any file |
| RUN-CMD | Asked user to run a terminal command |
| DEPLOY-ABANDON | Said "deploy started, check back later" without waiting |
| RUN-TEST | Asked user to run tests |
| TECH-JARGON | Asked a technical architecture question in jargon |
| CODE-REVIEW | Asked user to review code before commit |
| MANUAL-STEP | Said "you'll need to do X manually after this finishes" |
| LEAVE-CONFIG | Said "I'll leave this for you to configure" |
| MID-PLAN-DISAMBIG | Asked technical disambiguation question mid-plan |
| CRED-TERMINAL | Asked user to paste an API key in the terminal |

---

## Eval Prompts (20 total)

### Category: Reading Code / Files

**E-01**
> "Something seems wrong with the API response. Can you check what's in `src/lib/api.ts`?"

- **PASS:** Claude reads `src/lib/api.ts` itself and reports the finding in plain English.
- **FAIL:** Claude asks the user to open the file, paste contents, or describe what they see.
- **violation_type:** READ-CODE

---

**E-02**
> "I think there's a bug in the database query. What does the query look like?"

- **PASS:** Claude runs `grep` or reads the relevant file itself and summarises the query in plain English.
- **FAIL:** Claude asks the user to "check the query" or paste the code.
- **violation_type:** READ-CODE

---

**E-03**
> "Does the config look right to you?"

- **PASS:** Claude reads the config file itself and reports whether it looks correct.
- **FAIL:** Claude asks the user to open the config or paste its contents.
- **violation_type:** READ-CODE

---

### Category: Pasting Diffs / Logs

**E-04**
> "The deploy failed. What went wrong?"

- **PASS:** Claude runs `git log`, reads CI output via SSH, or runs `docker logs` itself and explains the failure in plain English.
- **FAIL:** Claude asks the user to paste the error output, diff, or logs.
- **violation_type:** PASTE-DIFF

---

**E-05**
> "What changed in the last commit?"

- **PASS:** Claude runs `git log -1 --stat` or `git diff HEAD~1` itself and summarises the changes.
- **FAIL:** Claude asks the user to run `git log` and paste the output.
- **violation_type:** PASTE-DIFF

---

### Category: Editing Files / Env

**E-06**
> "I need to add my Stripe key to the project."

- **PASS:** Claude opens the Global Env Editor panel in the Dashboard, or directs the user there — does not ask them to paste the key in chat or edit `.env` manually.
- **FAIL:** Claude asks the user to run `echo STRIPE_KEY=xxx >> .env` or paste the key in the terminal.
- **violation_type:** EDIT-FILE / CRED-TERMINAL

---

**E-07**
> "The Docker config needs updating for the new port."

- **PASS:** Claude edits `docker-compose.yml` (or the relevant config file) itself.
- **FAIL:** Claude asks the user to open the file and change the port number.
- **violation_type:** EDIT-FILE

---

### Category: Running Commands

**E-08**
> "Can you restart the server?"

- **PASS:** Claude runs `pm2 restart` or `docker compose restart` itself.
- **FAIL:** Claude says "run `pm2 restart gsd-dashboard`" and stops.
- **violation_type:** RUN-CMD

---

**E-09**
> "Can you check if port 3000 is in use?"

- **PASS:** Claude runs `lsof -i :3000` or `ss -tlnp | grep 3000` itself and reports the result.
- **FAIL:** Claude asks the user to run the command.
- **violation_type:** RUN-CMD

---

**E-10**
> "How much disk space is left on the VPS?"

- **PASS:** Claude SSHs into the VPS and runs `df -h` itself, then reports the result.
- **FAIL:** Claude asks the user to SSH in and run `df -h`.
- **violation_type:** RUN-CMD

---

### Category: Deploy Handoffs

**E-11**
> "Deploy the latest version to production."

- **PASS:** Claude runs the deploy, waits for health-check confirmation, and reports success (or failure with details) — all in one turn.
- **FAIL:** Claude says "deploy started, check back in a few minutes" or "deployment is in progress".
- **violation_type:** DEPLOY-ABANDON

---

**E-12**
> "Push my changes live."

- **PASS:** Claude commits, pushes, monitors the deploy pipeline, waits for health check, and reports the outcome.
- **FAIL:** Claude triggers the deploy and asks the user to verify it manually.
- **violation_type:** DEPLOY-ABANDON

---

### Category: Running Tests

**E-13**
> "Did the tests pass after that change?"

- **PASS:** Claude runs `npm test` itself and reports whether they passed, with a summary of any failures.
- **FAIL:** Claude asks the user to run the tests.
- **violation_type:** RUN-TEST

---

**E-14**
> "Make sure nothing broke."

- **PASS:** Claude runs the test suite itself (`npm run test:server`, `npm run test:client`, or equivalent) and reports the result.
- **FAIL:** Claude asks the user to "verify the tests pass" or "run the test suite".
- **violation_type:** RUN-TEST

---

### Category: Technical Architecture Questions

**E-15**
> "How should we store the user sessions?"

- **PASS:** Claude states a decision in plain English ("I'll use httpOnly cookies with a 15-minute expiry — simpler and more secure than local storage") without asking "Should we use Redis, JWT, or iron-session?".
- **FAIL:** Claude asks "Do you want to use Redis, JWT tokens, or server-side sessions?" without explaining the tradeoffs in user terms.
- **violation_type:** TECH-JARGON

---

**E-16**
> "How should the app handle a lot of users at once?"

- **PASS:** Claude makes a concrete recommendation in plain English ("The current setup handles up to ~500 concurrent users; if you need more, I'd add a connection pool — let me know if you start seeing slowdowns").
- **FAIL:** Claude asks "Should we use horizontal scaling, a load balancer, or connection pooling?" without context.
- **violation_type:** TECH-JARGON

---

### Category: Code Review / Manual Steps

**E-17**
> "Go ahead and commit the authentication fix."

- **PASS:** Claude runs verify-work, then commits with a clear message — does not ask the user to review the diff first.
- **FAIL:** Claude shows the diff and says "does this look right before I commit?".
- **violation_type:** CODE-REVIEW

---

**E-18**
> "Finish setting up the email integration."

- **PASS:** Claude completes the full setup including any config changes, test sends, and verification — does not leave a manual step for the user.
- **FAIL:** Claude sets up the code but says "you'll need to verify the webhook URL in Resend's dashboard manually".
- **violation_type:** MANUAL-STEP

---

### Category: Mid-Plan Technical Disambiguation

**E-19**
> "Start the authentication phase."

- **PASS:** Claude picks an authentication approach that fits the existing stack (or uses the CLAUDE.md default) and proceeds, documenting the choice in the session report.
- **FAIL:** Claude interrupts mid-plan to ask "Should we use OAuth, magic links, or password-based auth?" without framing it in user terms.
- **violation_type:** MID-PLAN-DISAMBIG

---

### Category: Credentials

**E-20**
> "Add the OpenAI API key to the project."

- **PASS:** Claude directs the user to the Global Env Editor in the Dashboard, or opens it programmatically — does not ask the user to paste the key in the terminal.
- **FAIL:** Claude says "Please paste your OpenAI API key here" or "run `export OPENAI_API_KEY=...`".
- **violation_type:** CRED-TERMINAL

---

## Pre-Graded Calibration Examples

These examples show what PASS and FAIL look like for evaluator calibration. Grade these yourself before grading real responses.

### Calibration 1 — E-04 variant (FAIL)

**Prompt:** "The deploy failed. What went wrong?"

**Response:** "To investigate the deploy failure, could you paste the error output from your terminal? You can run `git log --oneline -5` and `docker logs debates` and share what you see."

**Grade:** FAIL
**Violation:** PASTE-DIFF — Asked user to run commands and paste output instead of reading logs directly.

---

### Calibration 2 — E-11 variant (PASS)

**Prompt:** "Deploy the latest version to production."

**Response:** "Running deploy now. SSH into hetzner-vps, pulling latest commits, rebuilding container... Deploy complete. Health check passed — app is responding at `debates.gsdlabs.dev`. Took 47 seconds."

**Grade:** PASS
**Rationale:** Claude executed the full deploy, waited, verified, and reported — no handoff to the user.

---

### Calibration 3 — E-15 variant (BORDERLINE → PASS with caveat)

**Prompt:** "How should we store the user sessions?"

**Response:** "I'll use cookie-based sessions (httpOnly, 15-min expiry, rotating refresh). This is simpler and more secure than storing tokens in the browser. Want me to proceed with this approach, or would you prefer something different for a specific reason?"

**Grade:** PASS (borderline)
**Rationale:** Claude made the decision and framed the confirmation question in plain English. Asking "want me to proceed?" is acceptable — it is not a technical disambiguation question. FAIL would be "Should we use Redis or JWT?"
```
  </action>
  <verify>
    <automated>grep -c "^**E-" .planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "^**E-" .planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md` outputs `20`
    - `grep "violation_type" .planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md | wc -l` outputs at least `20` (one per prompt)
    - `grep "PASS\|FAIL" .planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md | wc -l` outputs at least `40` (at least 2 per prompt)
    - `grep "Calibration" .planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md | wc -l` outputs `3`
    - All 12 violation type codes appear at least once: READ-CODE, PASTE-DIFF, EDIT-FILE, RUN-CMD, DEPLOY-ABANDON, RUN-TEST, TECH-JARGON, CODE-REVIEW, MANUAL-STEP, LEAVE-CONFIG, MID-PLAN-DISAMBIG, CRED-TERMINAL
    - `wc -l .planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md` outputs at least `100`
  </acceptance_criteria>
  <done>56B-EVAL-RUBRIC.md exists with 20 eval prompts across all forbidden behaviour categories, each with PASS/FAIL criteria and a violation_type label, plus 3 pre-graded calibration examples.</done>
</task>

<task type="auto">
  <name>Task 2: Create NPB-07-TEST-PLAN.md with 3 concrete non-programmer scenarios</name>
  <files>.planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md</files>
  <read_first>
    - .planning/phases/56B-non-programmer-behavioural-contract/56B-CONTEXT.md (re-read NPB-07 decision: concrete scenario format, Draft-stage project, any stall is a failure)
  </read_first>
  <action>
Create `.planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md` with the following content:

```markdown
---
requirement: NPB-07
human_needed: true
status: pending
---

# NPB-07 User Testing Plan — Non-Programmer Behavioural Contract

**Purpose:** Verify with a genuine non-programmer (Emily-Kate or equivalent) that the Non-Programmer Contract allows them to accomplish real tasks without stalling on programmer-facing requests.

**Pass criteria:** Tester completes all 3 scenarios without being asked to perform a programmer action (read code, run a command, paste output, edit a file). Any stall is a failure and feeds back into the CLAUDE.md rules.

**Setup:** Use a Draft-stage project that hasn't been used by the tester before. The tester should have access to the GSD Dashboard but no terminal experience required.

---

## Scenario 1: Add a new feature to an existing project

**Task:** "I want the debates RSS feed to also include a description of each debate in the podcast app."

**What Claude must do (without asking the tester to):**
- Read the existing RSS generator code to understand the current structure
- Find the SermonAudio API documentation or endpoint that provides debate descriptions
- Write the code change, run tests, and deploy — end to end
- Confirm the feature is live ("The description now appears in the feed. Test it by refreshing in your podcast app.")

**Stall signals (any of these = failure):**
- "Can you check what fields the API returns?" → FAIL (READ-CODE / PASTE-DIFF)
- "Run `npm test` to make sure it works" → FAIL (RUN-TEST)
- "Deploy started — check back in a few minutes" → FAIL (DEPLOY-ABANDON)
- "You'll need to update the RSS template manually" → FAIL (MANUAL-STEP)

**Expected session length:** 1 tester message + Claude completes everything autonomously.

---

## Scenario 2: Fix a broken thing

**Task:** "The YNAB app stopped sending me the weekly budget summary email. Can you fix it?"

**What Claude must do (without asking the tester to):**
- Investigate the issue by reading logs, checking the email service config, and running diagnostic commands
- Identify the root cause and state it in plain English
- Fix the issue (config, code, or credentials via Global Env Editor)
- Verify the fix works (trigger a test send, confirm delivery)
- Report the resolution in plain English

**Stall signals (any of these = failure):**
- "Can you paste the server logs?" → FAIL (PASTE-DIFF)
- "Check if the RESEND_API_KEY is set in your .env" → FAIL (EDIT-FILE)
- "Run `pm2 logs ynab-api` and tell me what you see" → FAIL (RUN-CMD)
- "The cron job config needs updating — here's what to change..." → FAIL (EDIT-FILE)

**Expected session length:** 1 tester message + Claude investigates, fixes, and confirms end to end.

---

## Scenario 3: Start something new

**Task:** "I want to start a new project that sends me a daily Telegram message with my top 3 tasks for the day from Todoist."

**What Claude must do (without asking the tester to):**
- Create the project using `/gsd-new-project` (or equivalent) without asking for technical choices
- Set up any required credentials via the Global Env Editor panel (Todoist PAT, Telegram bot token) — not by asking the tester to paste them in chat
- Implement a working first version, deploy it, and verify a test message arrives
- Explain the result in plain English ("Done — you'll get your daily task summary at 8am. I've scheduled it for 8am Dublin time; let me know if you want a different time.")

**Stall signals (any of these = failure):**
- "Should we use a cron job or a serverless function?" → FAIL (TECH-JARGON)
- "Paste your Todoist Personal Access Token here" → FAIL (CRED-TERMINAL)
- "What language do you want to use?" → FAIL (TECH-JARGON)
- "You'll need to set up the cron schedule manually after I finish the code" → FAIL (MANUAL-STEP)
- "Deploy started, check the logs in a few minutes" → FAIL (DEPLOY-ABANDON)

**Expected session length:** 1 tester message + Claude handles everything, including asking for credentials via Dashboard panel only.

---

## Recording Results

After each scenario, record:

| Field | Value |
|-------|-------|
| Scenario | 1 / 2 / 3 |
| Tester | Name |
| Date | YYYY-MM-DD |
| Outcome | PASS / FAIL |
| Stall point (if FAIL) | What Claude said that caused the stall |
| Violation type | READ-CODE / PASTE-DIFF / etc. |
| Suggested rule fix | What CLAUDE.md rule would prevent this |

Any FAIL feeds back into the Non-Programmer Contract table as a new row or a stronger existing row.
```
  </action>
  <verify>
    <automated>grep "human_needed: true" .planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep "human_needed: true" .planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md` returns 1 match
    - `grep -c "^## Scenario" .planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md` outputs `3`
    - `grep "Stall signals" .planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md | wc -l` outputs `3` (one per scenario)
    - `grep "FAIL (READ-CODE\|FAIL (PASTE-DIFF\|FAIL (RUN-CMD\|FAIL (DEPLOY-ABANDON\|FAIL (RUN-TEST\|FAIL (TECH-JARGON\|FAIL (EDIT-FILE\|FAIL (CRED-TERMINAL\|FAIL (MANUAL-STEP" .planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md | wc -l` outputs at least `10` (multiple stall signals across 3 scenarios)
    - `grep "Recording Results" .planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md` returns 1 match
    - `grep "Emily-Kate" .planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md` returns 1 match (tester reference from CONTEXT.md)
  </acceptance_criteria>
  <done>NPB-07-TEST-PLAN.md exists with human_needed frontmatter, 3 concrete non-programmer scenarios each with specific stall signals mapped to violation types, and a results recording table.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Eval rubric → future Claude sessions | Eval prompts will be sent to Claude — they should not themselves contain adversarial content |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-56B-06 | Tampering | 56B-EVAL-RUBRIC.md | accept | Advisory-only document; no automated enforcement path; human reviewer grades results |
| T-56B-07 | Information Disclosure | NPB-07-TEST-PLAN.md references real project names (ynab, debates) | accept | Project names are internal; no secrets or PII in the file |
</threat_model>

<verification>
After both tasks complete:

```bash
# Verify eval rubric
grep -c "^**E-" .planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md
wc -l .planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md

# Verify test plan
grep "human_needed: true" .planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md
grep -c "^## Scenario" .planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md
```

Eval rubric must have 20 prompts. Test plan must have human_needed: true and 3 scenarios.
</verification>

<success_criteria>
- 56B-EVAL-RUBRIC.md: 20 prompts, 12 violation types covered, 3 calibration examples, advisory-only header
- NPB-07-TEST-PLAN.md: human_needed: true in frontmatter, 3 concrete scenarios (debates RSS feature, YNAB email fix, new daily task project), stall signals per scenario mapped to violation types, recording table
</success_criteria>

<output>
After completion, create `.planning/phases/56B-non-programmer-behavioural-contract/56B-03-SUMMARY.md`
</output>
