---
paths:
  - "server/**/*.js"
  - "scripts/**/*.js"
---

# Backend and Hook Rules

- Keep API responses backward-compatible unless a breaking change is explicitly requested.
- Maintain deterministic, non-blocking hook ingestion behavior.
- Preserve transaction boundaries and data integrity in event processing logic.
- For route changes, validate input thoroughly and return structured errors.
- Prefer prepared-statement usage patterns already established in `server/db.js`.
- If touching status transitions, verify session and agent lifecycle state machines still make sense.
