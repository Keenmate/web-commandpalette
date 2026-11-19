# Accessibility

- The open palette is a **modal dialog** (`role="dialog"`, `aria-modal="true"`, labelled by
  `labels['ariaLabels.dialog']`).
- The input is a **combobox** (`role="combobox"`, `aria-autocomplete="list"`,
  `aria-controls` → the results `listbox`). The highlighted row is exposed via
  `aria-activedescendant`; rows are `role="option"` with `aria-selected`.
- Home-screen sections are `role="group"` with the section heading as their label.
- Core's page-wide live region (`announce()`, shared by every component, readable while the modal makes the page inert) announces the result count (`labels['ariaLabels.resultsCount']`), the
  empty-state text and "Done: …" after a command; the visible context pill (e.g. "Searching in Products") is `aria-live="polite"`.
- **Focus**: opening focuses the input; closing returns focus to the element that had it. Focus
  stays inside the dialog — <kbd>Tab</kbd> in the input selects (one wizard step at a time),
  <kbd>Shift</kbd>+<kbd>Tab</kbd> steps back, and from
  the fullscreen close button it returns to the input.
- **Keyboard**: everything is reachable without a pointer — see the keyboard map in the
  [usage guide](./usage.md#keyboard). `g <letter>` sequences are ignored while typing in any
  field, so they never hijack text entry.
- The page behind is scroll-locked while open; on touch phones the palette becomes a fullscreen
  sheet that stays above the on-screen keyboard.
- **RTL**: `dir="rtl"` on the element or an ancestor mirrors the layout and the ←/→ paging keys;
  mixed-direction text is bidi-isolated so command shortcuts keep their order.
- The searching loader is `role="status"`, named by its visible text (`messages.searching` — one text, one key; the
  text itself is `aria-hidden` so it is heard once).
- All visible and announced strings come from `labels` — localise them for screen-reader users too. An `ariaLabels.*` /
  `tooltips.*` key you leave unset follows a customized sibling with the same name (core `/locale` twin fallback):
  translating `labels.close` also names the close button, `ariaLabels.addFavorite` also titles the star.
- **Favorites**: the ☆ buttons are pointer affordances (`tabindex="-1"`, `aria-pressed`, labelled
  with `ariaLabels.addFavorite` / `ariaLabels.removeFavorite`, tooltip `tooltips.*`); the keyboard equivalent is
  <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>D</kbd> on the active row, advertised in the footer.
