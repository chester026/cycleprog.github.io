// Calendar e2e: login → /calendar → "New event" for the selected day →
// the event appears in the grid and the day panel, and opens its detail
// sheet. Runs against the real API from e2e/global-setup.cjs (no Strava, so
// there are no rides to overlay — the assertions only involve the event).
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers.cjs');

test.describe('calendar', () => {
  test('creates an event for a day and shows it in the grid and the day panel', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Calendar' }).click();
    await expect(page).toHaveURL(/\/calendar$/);
    await expect(page.getByRole('grid', { name: 'Month' })).toBeVisible();

    // Pick a fixed day so the test is independent of today's date.
    await page.goto('/calendar?date=2026-06-18');
    await expect(page.getByText('June 2026')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Thu, Jun 18' })).toBeVisible();

    await page.getByRole('button', { name: '+ New event' }).click();
    const sheet = page.getByRole('dialog', { name: 'New event' });
    await expect(sheet.getByText('Thursday, June 18, 2026')).toBeVisible();
    await sheet.getByLabel('Maintenance').check();
    await sheet.getByLabel('Title').fill('Replace chain');
    await sheet.getByLabel('Start time').fill('18:30');
    await sheet.getByLabel('Duration (min)').fill('45');
    await sheet.getByRole('button', { name: 'Add event' }).click();
    await expect(sheet).toBeHidden();

    const cell = page.getByTestId('calendar-day-2026-06-18');
    await expect(cell.getByTitle('Replace chain')).toBeVisible();

    const panel = page.getByRole('complementary', { name: 'Selected day' });
    const row = panel.getByRole('button', { name: 'Replace chain, Maintenance' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('18:30 · ~45 min');

    await row.click();
    const detail = page.getByRole('dialog', { name: 'Replace chain' });
    await expect(detail.getByText('Thursday, June 18, 2026 · 18:30 · ~45 min')).toBeVisible();
    await detail.getByRole('button', { name: 'Mark as done' }).click();
    await expect(detail.getByText('Done')).toBeVisible();
  });
});
