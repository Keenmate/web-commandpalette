import type { CommandPaletteIconName } from './types';

/**
 * The palette's own icons by NAME — core `renderIcon`'s `defaults` (SPEC §12.33, rulebook C-CA-42). Each is a glyph
 * masked from its `--cp-icon-*` token in `currentColor` (`.cp__icon--<glyph>` in base.css), so a theme keeps
 * re-skinning them through the tokens; `el.icons` / `window.components.icons` (`'web-command-palette.<name>'` before
 * `'<name>'`) / the `renderIconCallback` hooks replace one by name (markup, a built-in name, icon-font classes, text).
 * None of the names is a core built-in name, so the hooks see them and an unmapped name keeps the palette's glyph.
 */
export const CP_ICONS: Readonly<Record<CommandPaletteIconName, string>> = Object.freeze({
  star: glyph('star'),
  starFilled: glyph('star-filled'),
  removeToken: glyph('remove'),
  done: glyph('check'),
});

/** Every palette icon name (the `icons` row's keys). */
export const CP_ICON_NAMES = Object.freeze(Object.keys(CP_ICONS) as CommandPaletteIconName[]);

function glyph(modifier: string): string {
  return `<span class="km-icon cp__icon cp__icon--${modifier}" aria-hidden="true"></span>`;
}
