import { defineComponentConfig } from '@keenmate/web-components-devkit/vite';

// Ports, lib output (dist/web-commandpalette.js + .umd.js, rolled-up .d.ts),
// build-time constants and the examples site come from package.json#kmwc.
// web-components-core is bundled (like web-multiselect) so the UMD build is drop-in.
export default defineComponentConfig({
  overrides: {
    // Dev dep-scan only the real pages — not stray HTML in tmp/, test-results/ etc.
    optimizeDeps: { entries: ['index.html', 'examples-*.html', 'test/fixture.html'] },
  },
});
