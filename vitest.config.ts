import { defineConfig } from 'vitest/config';

/**
 * Vitest config for unit tests.
 *
 * Unit specs live in test/unit/*.test.ts. The palette MACHINE (src/palette.ts)
 * is DOM-free and tested directly; element-level specs run in happy-dom.
 * Real-browser interaction (keyboard, focus, shadow-DOM theming) lives in the
 * Playwright e2e suite (e2e/).
 *
 * Commands:
 *   npm run test:unit                      # run once
 *   npm run test:unit:watch                # watch mode
 *   npx vitest run test/unit/filter.test.ts
 *   npx vitest run -t "context search"
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/unit/**/*.test.ts'],
    globals: true
  },
  // Mirror the build-time constants vite.config.ts defines so importing src/index.ts works.
  define: {
    '__VERSION__': JSON.stringify('test'),
    '__PACKAGE_NAME__': JSON.stringify('@keenmate/web-commandpalette'),
    '__AUTHOR__': JSON.stringify('test'),
    '__LICENSE__': JSON.stringify('MIT'),
    '__REPOSITORY__': JSON.stringify('test'),
    '__HOMEPAGE__': JSON.stringify('test')
  }
});
