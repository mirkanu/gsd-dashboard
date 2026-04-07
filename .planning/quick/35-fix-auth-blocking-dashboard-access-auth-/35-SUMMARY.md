# Quick Task 35: Fix auth blocking dashboard access - AUTH_REQUIRED error

## What Changed

The Phase 37 cookie-based auth middleware (`cookieAuth` in `server/index.js`) was blocking ALL HTTP requests that didn't match the API skip list — including static file serving (HTML, JS, CSS). This meant the browser couldn't even load the login page on Railway.

## Root Cause

`cookieAuth` ran before `express.static()` in the middleware chain. Non-API paths (static assets, SPA routes) weren't in the skip list, so they got `401 AUTH_REQUIRED`.

## Fix

Added early return for non-`/api/` paths: `if (!req.path.startsWith("/api/")) return next()`. This lets static files through — the client-side auth gate (`useAuth` in `App.tsx`) handles UI access control.

## Files Modified

- `server/index.js` — added non-API path bypass in `cookieAuth`

## Commit

- `7ba51c5`: fix(quick-35): allow static assets through auth middleware
