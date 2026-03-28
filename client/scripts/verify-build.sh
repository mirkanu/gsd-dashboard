#!/bin/sh
# Asserts that the Vite build produced a non-empty dist/index.html.
# Run after `npm run build` in the Dockerfile to catch silent build failures.
set -e
DIST="dist/index.html"
if [ ! -f "$DIST" ]; then
  echo "ERROR: $DIST not found — Vite build produced no output. Aborting."
  exit 1
fi
SIZE=$(wc -c < "$DIST")
if [ "$SIZE" -lt 500 ]; then
  echo "ERROR: $DIST is suspiciously small ($SIZE bytes). Aborting."
  exit 1
fi
echo "Build OK: $DIST exists ($SIZE bytes)"
