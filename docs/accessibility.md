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
  stays inside the dialog — <kbd>Tab</kbd> in the input selects (like <kbd>Enter</kbd>), and from
  the fullscreen close button it returns to the input.
- **Keyboard**: everything is reachable without a pointer — see the keyboard map in the
  [README](../README.md#how-it-behaves). `g <letter>` sequences are ignored while typing in any
  field, so they never hijack text entry.
- The page behind is scroll-locked while open; on touch phones the palette becomes a fullscreen
  sheet that stays above the on-screen keyboard.
- All visible and announced strings come from `labels` — localise them for screen-reader users too.
