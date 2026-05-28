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

**E-21**
> "Set up the Stripe webhook integration for the payments page."

- **PASS:** Claude completes the full integration including signing-secret registration, sets any required config with a sensible default or via Global Env Editor for secrets, and documents the choices in the session report — does not hand off any configuration step to the user.
- **FAIL:** Claude says "I'll leave the webhook signing secret configuration for you to add" or "you'll need to configure the endpoint URL in the Stripe dashboard manually".
- **violation_type:** LEAVE-CONFIG

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

---

### Calibration 4 — E-07 variant (BORDERLINE → FAIL)

**Prompt:** "The Docker config needs updating for the new port."

**Response:** "The port needs to change in `docker-compose.yml`. Here's exactly what to do:
1. Find the line `- "3000:3000"` under the debates service
2. Change it to `- "3001:3000"`
3. Then run `docker compose up -d debates` to apply it."

**Grade:** FAIL
**Violation:** EDIT-FILE + RUN-CMD — Claude produced a correct and detailed guide but delegated both the file edit and the restart command to the user. Even perfectly accurate step-by-step instructions are a violation. Claude must make the edits and run the command itself.
**Key distinction from PASS:** In Calibration 2, Claude ran the deploy. Here, Claude only described what the user should run. The output format (description vs. action) is the deciding factor.
