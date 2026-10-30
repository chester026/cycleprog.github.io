// Coach chat e2e: login → /coach → type → scripted SSE stream → reply renders
// → Stop → the conversation shows up in "Recent chats". The chat stream
// comes from e2e/coach-stream-mock.cjs through Vite's proxy (no OpenAI);
// every other request hits the real API booted by e2e/global-setup.cjs.
const { test, expect } = require('@playwright/test');
const { login, sse, scriptCoachStream, coachRequests } = require('./helpers.cjs');

const CONVERSATION_ID = '11111111-2222-4333-8444-555555555555';

test.describe('coach chat', () => {
  test('streams a reply, stops it and lists the conversation', async ({ page, request }) => {
    await scriptCoachStream(
      request,
      [
        sse({ type: 'conversation', conversation_id: CONVERSATION_ID }),
        ': ping\n\n',
        sse({ type: 'tool_call', name: 'get_user_profile', args: {} }),
        sse({ type: 'tool_result', name: 'get_user_profile', result: {} }),
        sse({ type: 'token', content: 'Here is **your** plan:\n' }),
        sse({ type: 'token', content: '- Tuesday: intervals\n' }),
        sse({ type: 'token', content: '- Thursday: endurance' }),
      ],
      // No `done`: the turn keeps streaming until the rider presses Stop.
      true,
    );
    // The real API never saw the mocked turn, so the list it would return is
    // empty; answer the list from the test so it reflects what the user did.
    await page.route('**/api/coach/conversations', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: CONVERSATION_ID,
            title: 'Plan my week',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            message_count: '2',
          },
        ]),
      });
    });

    await login(page);
    await page.getByRole('link', { name: 'Coach' }).click();
    await expect(page).toHaveURL(/\/coach$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('what should we work on today?');

    await page.getByTestId('coach-home-input').fill('Plan my week');
    await page.getByTestId('coach-home-send').click();

    await expect(page.getByTestId('coach-chat')).toBeVisible();
    await expect(page.getByTestId('chat-bubble-user')).toHaveText('Plan my week');
    await expect.poll(() => coachRequests(request)).toEqual([
      { message: 'Plan my week', conversation_id: null, client: 'web' },
    ]);

    await expect(page.getByText('Checking your profile...')).toBeVisible();
    const reply = page.getByTestId('chat-bubble-assistant');
    await expect(reply).toContainText('Thursday: endurance');
    await expect(reply.locator('strong')).toHaveText('your');

    // Stop closes the connection and keeps the partial text, no error strip.
    await page.getByTestId('coach-stop-button').click();
    await expect(page.getByTestId('coach-send-button')).toBeVisible();
    await expect(reply).toContainText('Tuesday: intervals');
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.getByRole('button', { name: '‹ Back' }).click();
    await expect(page).toHaveURL(/\/coach$/);
    await expect(page.getByRole('heading', { name: 'Recent chats' })).toBeVisible();
    await expect(page.getByText('Plan my week', { exact: true })).toBeVisible();
    await expect(page.getByText(/2 msgs/)).toBeVisible();
  });

  test('a create_goal tool result renders a GoalCreated card that opens /goals/:id', async ({ page, request }) => {
    const GOAL_CONVERSATION_ID = '22222222-3333-4444-8555-666666666666';
    await scriptCoachStream(
      request,
      [
        sse({ type: 'conversation', conversation_id: GOAL_CONVERSATION_ID }),
        sse({ type: 'tool_call', name: 'create_goal', args: { title: 'Ride 1000 km' } }),
        sse({
          type: 'tool_result',
          name: 'create_goal',
          result: { created: true, metaGoal: { id: 77, title: 'Ride 1000 km', description: 'By December', tier: 'grand' } },
        }),
        sse({ type: 'token', content: 'Your goal is set — **Ride 1000 km** by December.' }),
        sse({ type: 'done', conversation_id: GOAL_CONVERSATION_ID, message_id: 'm-goal' }),
      ],
      false,
    );
    // The mocked turn never reached the API, so answer the goal page's
    // reads from the test too.
    await page.route('**/api/meta-goals/77', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 77, title: 'Ride 1000 km', description: 'By December', tier: 'grand', status: 'active', goals: [] }),
      }),
    );

    await login(page);
    await page.goto('/coach');
    await page.getByTestId('coach-home-input').fill('Set a goal');
    await page.getByTestId('coach-home-send').click();

    await expect(page.getByText('Building your training plan...')).toBeVisible();
    const card = page.getByTestId('goal-created-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Goal created');
    await expect(card).toContainText('Ride 1000 km');
    await expect(card).toContainText('View Details');
    await expect(page.getByTestId('chat-bubble-assistant')).toContainText('Your goal is set');

    // Wait for the turn's `done` (which lands the chat on its own URL) so
    // that navigation can't race the card's.
    await expect(page).toHaveURL(new RegExp(`/coach/c/${GOAL_CONVERSATION_ID}$`));
    await card.click();
    await expect(page).toHaveURL(/\/goals\/77$/);
  });

  test('/coach?prompt=… auto-sends the prompt and strips the params', async ({ page, request }) => {
    const LINK_CONVERSATION_ID = '44444444-5555-4666-8777-888888888888';
    await scriptCoachStream(request, [
      sse({ type: 'conversation', conversation_id: LINK_CONVERSATION_ID }),
      sse({ type: 'token', content: 'Hello! Ready when you are.' }),
      sse({ type: 'done', conversation_id: LINK_CONVERSATION_ID, message_id: 'm-link' }),
    ]);

    await login(page);
    await page.goto('/coach?prompt=Hello');

    await expect(page.getByTestId('chat-bubble-user')).toHaveText('Hello');
    await expect.poll(() => coachRequests(request)).toEqual([{ message: 'Hello', conversation_id: null, client: 'web' }]);
    await expect(page.getByTestId('chat-bubble-assistant')).toContainText('Ready when you are');
    await expect(page).toHaveURL(new RegExp(`/coach/c/${LINK_CONVERSATION_ID}$`));

    // Back to home and forward again must not resend: the params were
    // consumed and replaced, so history has no `?prompt=` entry.
    await page.getByRole('button', { name: '‹ Back' }).click();
    await expect(page).toHaveURL(/\/coach$/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/coach/c/${LINK_CONVERSATION_ID}$`));
    await expect.poll(() => coachRequests(request)).toHaveLength(1);
  });

  test('/goal-assistant redirects to /coach', async ({ page }) => {
    await login(page);
    await page.goto('/goal-assistant');
    await expect(page).toHaveURL(/\/coach$/);
    await expect(page.getByTestId('coach-home')).toBeVisible();
  });
});
