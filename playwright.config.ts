import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for end-to-end tests.
 *
 * Specs live in e2e/ and target the examples-*.html pages and the fixture pages
 * under test/*.html, served by the vite dev server on port 12300.
 *
 * Commands:
 *   npm run test:e2e:install   # one-time: download chromium browser binary
 *   npm run test:e2e           # headless run
 *   npm run test:e2e:ui        # Playwright Test UI (debugging)
 *   npx playwright test e2e/keyboard.spec.ts
 */
export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    expect: { timeout: 5_000 },

    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,

    reporter: process.env.CI ? 'github' : 'list',

    use: {
        baseURL: 'http://localhost:12300',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure'
    },

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
    ],

    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:12300',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        stdout: 'ignore',
        stderr: 'pipe'
    }
});
