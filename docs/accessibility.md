# Accessibility

- The open palette is a **modal dialog** (`role="dialog"`, `aria-modal="true"`, labelled by
  `labels.dialogLabel`).
- The input is a **combobox** (`role="combobox"`, `aria-autocomplete="list"`,
  `aria-controls` → the results `listbox`). The highlighted row is exposed via
  `aria-activedescendant`; rows are `role="option"` with `aria-selected`.
- Home-screen sections are `role="group"` with the section heading as their label.
- A visually hidden live region announces the result count (`labels.resultsCount`) or the
  empty-state text; the context pill (e.g. "Searching in Products") is `aria-live="polite"`.
- **Focus**: opening focuses the input; closing returns focus to the element that had it. Focus
  stays inside the dialog — <kbd>Tab</kbd> in the input selects (one wizard step at a time),
  <kbd>Shift</kbd>+<kbd>Tab</kbd> steps back, and from
  the fullscreen close button it returns to the input.
- **Keyboard**: everything is reachable without a pointer — see the keyboard map in the
  [README](../README.md#how-it-behaves). `g <letter>` sequences are ignored while typing in any
  field, so they never hijack text entry.
- The page behind is scroll-locked while open; on touch phones the palette becomes a fullscreen
  sheet that stays above the on-screen keyboard.
- **RTL**: `dir="rtl"` on the element or an ancestor mirrors the layout and the ←/→ paging keys;
  mixed-direction text is bidi-isolated so command shortcuts keep their order.
- All visible and announced strings come from `labels` — localise them for screen-reader users too.
- **Favorites**: the ☆ buttons are pointer affordances (`tabindex="-1"`, `aria-pressed`, labelled
  with `labels.addFavorite` / `labels.removeFavorite`); the keyboard equivalent is
  <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>D</kbd> on the active row, advertised in the footer.
