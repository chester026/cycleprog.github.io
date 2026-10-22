// Phone viewport (390×844, iPhone 14-ish): the sidebar is a drawer behind
// the burger, Esc closes it, and the coach composer sits inside the
// viewport without the page scrolling — the two layouts most likely to
// break when a desktop-first page is touched.
const { test, expect } = require('@playwright/test');
const { login, sse, scriptCoachStream } = require('./helpers.cjs');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.describe('mobile viewport', () => {
  test('sidebar drawer opens from the burger, closes on Esc and after navigating', async ({ page }) => {
    await login(page);

    const sidebar = page.getByTestId('sidebar');
    const burger = page.getByRole('button', { name: 'Open menu' });
    await expect(burger).toBeVisible();
    // Drawer is translated off-screen until opened.
    await expect(sidebar).not.toBeInViewport();

    await burger.click();
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Coach' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).not.toBeInViewport();

    // Navigating from the drawer closes it too.
    await burger.click();
    await page.getByRole('link', { name: 'Coach' }).click();
    await expect(page).toHaveURL(/\/coach$/);
    await expect(sidebar).not.toBeInViewport();
  });

  test('/coach home and chat composers fit the viewport', async ({ page, request }) => {
    const MOBILE_CONVERSATION_ID = '55555555-6666-4777-8888-999999999999';
    await scriptCoachStream(request, [
      sse({ type: 'conversation', conversation_id: MOBILE_CONVERSATION_ID }),
      sse({ type: 'token', content: 'Hi! Let us look at your week.' }),
      sse({ type: 'done', conversation_id: MOBILE_CONVERSATION_ID, message_id: 'm-mobile' }),
    ]);
    await login(page);
    await page.goto('/coach');

    const homeInput = page.getByTestId('coach-home-input');
    await expect(homeInput).toBeInViewport();
    await expect(page.getByTestId('coach-home-send')).toBeInViewport();

    await homeInput.fill('Hi');
    await page.getByTestId('coach-home-send').click();
    await expect(page.getByTestId('chat-bubble-assistant')).toContainText('your week');
    const input = page.getByTestId('coach-input');
    await expect(input).toBeInViewport();
    await expect(page.getByTestId('coach-send-button')).toBeInViewport();
    const box = await input.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    // No horizontal overflow on the chat page.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });
});
