# Validation notes

Rulebook checks (`KMWC_RULEBOOK_PATH=… npx kmwc doctor`) that fail for a reason the check can't
see. Each entry says why, and when to drop it.

## C-NC-9 — `GlobalKeys.handle(e)`

The check's regex wants `handle` followed by a capital letter (`handleKeydown`). The method in
`src/keyboard.ts` is named exactly `handle`: it is the one document `keydown` handler of
`GlobalKeys`, so it does use the `handle*` prefix the rule asks for. The devkit spotlight mirrors it
under the same name (`GlobalKeys.handle()`), so a rename would also have to be ported there.
Drop this note if the rulebook regex accepts a bare `handle(`, or if the method is renamed in both
places.
