import { definePlaywrightConfig, devices } from '@keenmate/web-components-devkit/playwright';

/**
 * Playwright config for end-to-end tests.
 *
 * Specs live in e2e/ and target the fixture pages under test/*.html (the
 * examples-*.html pages only in the examples.spec.ts smoke test). baseURL and the `npm run dev` web server come from
 * package.json#kmwc.ports.dev (the devkit preset).
 *
 * Commands:
 *   npm run test:e2e:install   # one-time: download the chromium, firefox and webkit binaries
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
            name: 'firefox',
            testIgnore: ['**/mobile.spec.ts'],
            use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 1024 } }
        },
        {
            name: 'webkit',
            testIgnore: ['**/mobile.spec.ts'],
            use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1024 } }
        },
        {
            // Touch-primary phone: coarse pointer + no hover → the fullscreen sheet.
            name: 'mobile',
            testMatch: ['**/mobile.spec.ts'],
            use: { ...devices['Pixel 7'] }
        }
    ]
});
