// Checklist e2e: /checklist → "New section" sheet (name + first item) →
// add a second item from the column → check one → rename the section from
// its sheet → delete the section (confirm). Real API, no Strava involved.
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers.cjs');

test.describe('checklist', () => {
  test('creates a section, adds and checks items, renames and deletes the section', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Checklist' }).click();
    await expect(page).toHaveURL(/\/checklist$/);
    await expect(page.getByRole('heading', { name: 'Checklist' })).toBeVisible();
    await expect(page.getByText('Add your first checklist section')).toBeVisible();

    // New section needs a name and its first item.
    await page.getByRole('button', { name: 'New section' }).first().click();
    const newSection = page.getByRole('dialog', { name: 'Add section' });
    await newSection.getByLabel('Section name').fill('Alps trip');
    await newSection.getByLabel('First item').fill('Rain jacket');
    await newSection.getByRole('button', { name: 'Add' }).click();
    await expect(newSection).toBeHidden();

    const column = page.getByRole('region', { name: 'Alps trip' });
    await expect(column.getByRole('checkbox', { name: 'Rain jacket' })).toBeVisible();
    await expect(column.getByLabel('0 of 1 done')).toBeVisible();

    // Second item from the column's + button.
    await column.getByRole('button', { name: 'Add item to Alps trip' }).click();
    const newItem = page.getByRole('dialog', { name: 'New item' });
    await expect(newItem.getByText('In Alps trip')).toBeVisible();
    await newItem.getByLabel('New item').fill('Spare tube');
    await newItem.getByRole('button', { name: 'Add' }).click();
    await expect(newItem).toBeHidden();
    await expect(column.getByLabel('0 of 2 done')).toBeVisible();

    // Check one — the counter and the overview follow.
    await column.getByRole('checkbox', { name: 'Spare tube' }).click();
    await expect(column.getByRole('checkbox', { name: 'Spare tube' })).toHaveAttribute('aria-checked', 'true');
    await expect(column.getByLabel('1 of 2 done')).toBeVisible();

    // Rename from the section sheet.
    await column.getByRole('button', { name: 'Edit section Alps trip' }).click();
    const sectionSheet = page.getByRole('dialog', { name: 'Rename section' });
    await sectionSheet.getByLabel('Section name').fill('Dolomites trip');
    await sectionSheet.getByRole('button', { name: 'Save Changes' }).click();
    await expect(sectionSheet).toBeHidden();
    const renamed = page.getByRole('region', { name: 'Dolomites trip' });
    await expect(renamed.getByRole('checkbox', { name: 'Rain jacket' })).toBeVisible();

    // Delete the section (both items go with it).
    await renamed.getByRole('button', { name: 'Edit section Dolomites trip' }).click();
    await page.getByRole('dialog', { name: 'Rename section' }).getByRole('button', { name: 'Delete section' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete section "Dolomites trip"?' });
    await expect(confirm).toContainText('2 items (1 completed)');
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Add your first checklist section')).toBeVisible();
  });
});
