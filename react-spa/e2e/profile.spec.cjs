// Profile "Coach memory" tab e2e: /profile?tab=coach → add a note → edit it
// inline → delete it (confirm dialog). Every call hits the real API from
// e2e/global-setup.cjs (coach notes need no Strava or OpenAI).
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers.cjs');

test.describe('profile: coach memory', () => {
  test('adds, edits and deletes a coach note', async ({ page }) => {
    await login(page);
    await page.goto('/profile?tab=coach');

    const panel = page.getByRole('tabpanel');
    await expect(page.getByRole('tab', { name: 'Coach memory' })).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByRole('heading', { name: /What your coach remembers/ })).toBeVisible();
    await expect(panel.getByText("Your coach hasn't remembered anything about you yet.")).toBeVisible();

    // Add
    await panel.getByLabel('Add note').fill('Prefers morning rides');
    await panel.getByRole('button', { name: 'Health' }).click();
    await panel.getByRole('button', { name: 'Add note' }).click();
    const note = panel.getByRole('button', { name: 'Prefers morning rides' });
    await expect(note).toBeVisible();
    await expect(panel.getByText('1/30')).toBeVisible();
    await expect(panel.getByText('Health', { exact: true })).toHaveCount(2); // chip + pill
    await expect(panel.getByLabel('Add note')).toHaveValue('');

    // Edit inline: click the text, retype, Enter saves.
    await note.click();
    const editor = panel.getByLabel('Edit note');
    await editor.fill('Prefers early morning rides');
    await editor.press('Enter');
    await expect(panel.getByRole('button', { name: 'Prefers early morning rides' })).toBeVisible();

    // Survives a reload. The query cache is persisted to localStorage with a
    // throttled write and a 5-min staleTime, so wait for the persisted copy
    // to carry the edit first — otherwise a reload inside the throttle window
    // hydrates the pre-edit list and, being "fresh", never refetches.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('bikelab.query.v1') || ''))
      .toContain('Prefers early morning rides');
    await page.reload();
    await expect(panel.getByRole('button', { name: 'Prefers early morning rides' })).toBeVisible();

    // Delete through the shared confirm dialog.
    await panel.getByRole('button', { name: 'Delete note' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete note' });
    await expect(confirm).toContainText('Prefers early morning rides');
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(panel.getByText("Your coach hasn't remembered anything about you yet.")).toBeVisible();
    await expect(panel.getByText('0/30')).toBeVisible();
  });
});
