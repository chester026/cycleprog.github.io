// Playwright smoke test (T-6.5, audit W-38..W-41): login → garage →
// analysis → 404 → logout, against the real API booted by
// e2e/global-setup.cjs. Strava-dependent widgets (last-ride banner, avatar,
// hero images…) are empty for the seeded user (no Strava connection) —
// this suite only asserts on elements that are stable regardless of
// whether the user has ever synced a ride.
const { test, expect } = require('@playwright/test');
const { SEED_EMAIL, SEED_PASSWORD } = require('./env.cjs');

async function login(page) {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(SEED_EMAIL);
  await page.getByPlaceholder('Password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

test.describe('smoke: login → garage → analysis', () => {
  test('logs in and lands on /garage with the sidebar', async ({ page }) => {
    await login(page);

    await expect(page).toHaveURL(/\/garage$/);
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bike Garage' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Analysis' })).toBeVisible();
  });

  test('navigates to /analysis and renders a heading + a chart', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/garage$/);

    await page.getByRole('link', { name: 'Analysis' }).click();
    await expect(page).toHaveURL(/\/analysis$/);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('training');
    // With no Strava data the chart sections render their empty states, so
    // assert the page shell (skills/analysis sections) rather than a
    // recharts node that only exists once there are rides to plot.
    await expect(page.locator('.plan-content').first()).toBeVisible();
  });

  test('an unknown route renders the 404 page', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/garage$/);

    await page.goto('/nope');
    await expect(page.getByTestId('not-found-page')).toBeVisible();
    await expect(page.getByText("This page doesn't exist.")).toBeVisible();
  });

  test('logout returns to /login', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/garage$/);

    await page.getByTestId('logout-button').click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
