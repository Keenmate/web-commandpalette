import { definePlaywrightConfig, devices } from '@keenmate/web-components-devkit/playwright';

/**
 * Playwright config for end-to-end tests.
 *
 * Specs live in e2e/ and target the examples-*.html pages and the fixture pages
 * under test/*.html. baseURL and the `npm run dev` web server come from
 * package.json#kmwc.ports.dev (the devkit preset).
 *
 * Commands:
 *   npm run test:e2e:install   # one-time: download chromium browser binary
 *   npm run test:e2e           # headless run
 *   npm run test:e2e:ui        # Playwright Test UI (debugging)
 *   npx playwright test e2e/keyboard.spec.ts
 */
export default definePlaywrightConfig({
    projects: [
        {
            name: 'chromium',
            testIgnore: ['**/mobile.spec.ts'],
            use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1024 } }
        },
        {
            // Touch-primary phone: coarse pointer + no hover → the fullscreen sheet.
            name: 'mobile',
            testMatch: ['**/mobile.spec.ts'],
            use: { ...devices['Pixel 7'] }
        }
    ]
});
