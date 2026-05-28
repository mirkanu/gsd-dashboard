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
