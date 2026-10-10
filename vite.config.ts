import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import dts from 'vite-plugin-dts';
// @ts-expect-error — plain .mjs build helper, no type declarations
import { shadowCssPlugin } from './scripts/shadow-css.mjs';

// Read package.json for build-time constants
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [
    // Compiles src/css/main.scss (core's palette partial) for the shadow root.
    shadowCssPlugin(),
    dts({ rollupTypes: true })
  ],
  define: {
    '__VERSION__': JSON.stringify(pkg.version),
    '__PACKAGE_NAME__': JSON.stringify(pkg.name),
    '__AUTHOR__': JSON.stringify(pkg.author),
    '__LICENSE__': JSON.stringify(pkg.license),
    '__REPOSITORY__': JSON.stringify(pkg.repository.url),
    '__HOMEPAGE__': JSON.stringify(pkg.homepage)
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'WebCommandPalette',
      formats: ['es', 'umd'],
      fileName: (format) => `web-commandpalette.${format === 'es' ? 'js' : 'umd.js'}`
    },
    rollupOptions: {
      // web-components-core is bundled (like web-multiselect) so the UMD build is drop-in.
      external: [],
      output: {
        globals: {}
      }
    }
  }
});
