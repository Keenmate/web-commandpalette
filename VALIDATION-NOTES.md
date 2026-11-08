# Validation notes

Rulebook checks (`KMWC_RULEBOOK_PATH=… npx kmwc doctor`) that fail for a reason the check can't
see. Each entry says why, and when to drop it.

## C-CST-4 — `palette.ts` is the Logic class, not a Service

The check finds the Logic file by a fixed list of names (`multiselect|grid|player|daterangepicker|
tree|treeview|switch|datetimepicker`, `component-structure.checks.sh`) and treats every other file as
a Service. The palette's Logic class is `PaletteEngine` in `src/palette.ts` (README "Code
structure"), so the three imports it reports are not Service → Service:

- `palette` → `usage`: the Logic class uses the `UsageStore` Service (allowed; coordination happens
  in the Logic class);
- `keyboard` → `palette`, `render` → `palette`: `import type` only — the input key map and the
  renderer read the engine they are handed (`PaletteEngine`, its view types). No runtime import.

The genuine service-to-service imports it found are fixed: `filter.ts` / `icons.ts` moved to
`src/helpers/` (Side layer) and `PaletteKeys` / `DEFAULT_PALETTE_KEYS` to `src/types.ts`.
Drop this note when the check reads the Logic file from the component (e.g. `palette` added to its
name list, or a manifest field).
