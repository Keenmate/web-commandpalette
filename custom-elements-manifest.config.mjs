import { blissAnalyzerConfig, cssVariablesFromManifestPlugin } from '@keenmate/web-components-core/cem';
import { customElementVsCodePlugin } from 'custom-element-vs-code-integration';
import { customElementJetBrainsPlugin } from 'custom-element-jet-brains-integration';

/**
 * The element's inputs/events are declared in the `static inputs` / `static events`
 * tables on `CommandPaletteElement`; core's `blissInputsPlugin()` (wired in by
 * `blissAnalyzerConfig()`) reads them from the AST so the manifest stays a single
 * source of truth with the runtime table. `cssVariablesFromManifestPlugin()` injects
 * the theming surface from `component-variables.manifest.json` as `cssProperties`.
 */
export default blissAnalyzerConfig({
  globs: ['src/**/*.ts'],
  exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.d.ts', 'src/index.ts'],
  outdir: '.',
  plugins: [
    cssVariablesFromManifestPlugin(),
    customElementVsCodePlugin({ outdir: '.' }),
    customElementJetBrainsPlugin({ outdir: '.', packageJson: false }),
  ],
});
