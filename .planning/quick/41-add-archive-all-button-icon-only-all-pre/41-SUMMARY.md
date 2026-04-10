# Quick Task 41: Add Archive All + icon-only All: group

## Changes

`client/src/components/TasksTab.tsx`:

1. **New `handleArchiveAll`**: Optimistically clears open tasks, then issues parallel `archived: 1` PATCH requests for each. Reverts from server on failure.
2. **"All:" group**: The Copy-all button + new Archive-all button are now grouped under an "All:" prefix label at the top-right. Both are icon-only (`ClipboardCopy` and `Archive`, same size as row buttons).
3. **Copied feedback**: Copy-all icon turns green briefly on copy (matches per-row copy button behavior).

## Commit

- `feat(quick-41): add Archive All button + icon-only All: group`
