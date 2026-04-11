# Deferred Items (Quick Task 42)

Pre-existing test failures observed during `node --test server/__tests__/api.test.js`, NOT caused by this task's changes. Left in place per SCOPE BOUNDARY rule.

1. `returns version and liveUrl for a project with PROJECT.md (gsddashboard)` (api.test.js:1071)
   - Failure: `version should be a string, got: null`
   - Pre-existing before this task's edits.

2. `POST /api/sessions is not proxied even when GSD_DATA_URL is set` (api.test.js:1328)
   - Failure: `404 !== 400`
   - Pre-existing before this task's edits.

Both failures reproduce on the base commit before any changes in this quick task.
