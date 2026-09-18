// Playwright config for the login → garage → analysis smoke suite (T-6.5,
// audit W-38..W-41). See e2e/global-setup.cjs for what boots behind
// `baseURL` (a real API + Vite dev server against a scratch Postgres DB).
const { defineConfig, devices } = require('@playwright/test');
const { WEB_PORT } = require('./e2e/env.cjs');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: [['list']],
  globalSetup: require.resolve('./e2e/global-setup.cjs'),
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Lets a machine with a preinstalled Chromium (e.g. the review
        // container: PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium/...)
        // run the suite without `playwright install`; CI installs normally.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
});
