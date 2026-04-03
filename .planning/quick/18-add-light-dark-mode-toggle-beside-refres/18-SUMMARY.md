# Quick Task 18: Add light/dark mode toggle

**Date:** 2026-04-03
**Status:** Complete

## Change
Added a Sun/Moon toggle button beside the Refresh button on the GSD page. Clicking it switches between dark (default) and light themes. Preference is persisted in localStorage.

## Implementation
- **Tailwind config**: `darkMode: "class"`, surface/border colors now use CSS variables
- **CSS**: Light and dark variable sets in `:root` / `:root.light`, text color overrides for light mode
- **HTML**: Inline script in `<head>` reads localStorage before paint to avoid flash
- **GSD.tsx**: Toggle button with Sun/Moon icons, toggles `dark`/`light` class on `<html>`
